export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut?: boolean;
}

export function isLiveRunnable(language: string): boolean {
  return language === 'javascript' || language === 'python' || language === 'html';
}

export function runJavaScriptInWorker(
  code: string,
  stdin = '',
  timeoutMs = 5000
): Promise<RunResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    const workerSource = `
      const __logs = [];
      const __errs = [];
      const __stdinLines = ${JSON.stringify(stdin.split('\n'))};
      let __stdinIdx = 0;
      const prompt = () => __stdinLines[__stdinIdx++] ?? '';
      const formatArg = (val) => {
        if (typeof val === 'string') return val;
        try { return JSON.stringify(val, null, 2); } catch { return String(val); }
      };
      const console = {
        log: (...args) => __logs.push(args.map(formatArg).join(' ')),
        info: (...args) => __logs.push(args.map(formatArg).join(' ')),
        warn: (...args) => __logs.push('[warn] ' + args.map(formatArg).join(' ')),
        error: (...args) => __errs.push(args.map(formatArg).join(' ')),
      };
      self.onmessage = (e) => {
        try {
          const fn = new Function('console', 'prompt', e.data.code);
          fn(console, prompt);
          self.postMessage({
            stdout: __logs.join('\\n'),
            stderr: __errs.join('\\n'),
            exitCode: __errs.length > 0 ? 1 : 0,
          });
        } catch (err) {
          let lineInfo = '';
          if (err && err.stack) {
            const match = /<anonymous>:(\\d+):(\\d+)/.exec(err.stack);
            if (match) {
              const adjLine = Math.max(1, Number(match[1]) - 2);
              lineInfo = ' (line ' + adjLine + ', col ' + match[2] + ')';
            }
          }
          __errs.push((err && err.name ? err.name + ': ' : '') + (err && err.message ? err.message : String(err)) + lineInfo);
          self.postMessage({
            stdout: __logs.join('\\n'),
            stderr: __errs.join('\\n'),
            exitCode: 1,
          });
        }
      };
    `;

    const blob = new Blob([workerSource], {type: 'application/javascript'});
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    let settled = false;

    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        stdout: '',
        stderr: `Execution timed out after ${timeoutMs / 1000} seconds.`,
        exitCode: 124,
        durationMs: Math.round(performance.now() - start),
        timedOut: true,
      });
    }, timeoutMs);

    worker.onmessage = (event) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve({
        stdout: event.data.stdout ?? '',
        stderr: event.data.stderr ?? '',
        exitCode: event.data.exitCode ?? 0,
        durationMs: Math.round(performance.now() - start),
      });
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanup();
      resolve({
        stdout: '',
        stderr: err.message || 'Worker execution error.',
        exitCode: 1,
        durationMs: Math.round(performance.now() - start),
      });
    };

    worker.postMessage({code});
  });
}

export function runPythonInWorker(
  code: string,
  stdin = '',
  onStatus?: (msg: string) => void,
  timeoutMs = 5000
): Promise<RunResult> {
  return new Promise((resolve) => {
    const workerSource = `
      let pyodideReady = null;
      async function loadRuntime() {
        if (!pyodideReady) {
          self.postMessage({ type: 'status', message: 'Loading Python (Pyodide) runtime...' });
          importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
          pyodideReady = loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
        }
        return pyodideReady;
      }

      self.onmessage = async (e) => {
        try {
          const pyodide = await loadRuntime();
          self.postMessage({ type: 'executing' });
          pyodide.globals.set('__arix_stdin', e.data.stdin || '');
          pyodide.globals.set('__arix_code', e.data.code || '');
          const resultJson = await pyodide.runPythonAsync(\`
import sys, io, json, traceback
_stdout = io.StringIO()
_stderr = io.StringIO()
_orig_out, _orig_err, _orig_in = sys.stdout, sys.stderr, sys.stdin
sys.stdout = _stdout
sys.stderr = _stderr
sys.stdin = io.StringIO(__arix_stdin)
_exit_code = 0
try:
    exec(compile(__arix_code, '<main.py>', 'exec'), {'__name__': '__main__'})
except Exception:
    _exit_code = 1
    traceback.print_exc(file=_stderr)
finally:
    sys.stdout = _orig_out
    sys.stderr = _orig_err
    sys.stdin = _orig_in
json.dumps({'stdout': _stdout.getvalue(), 'stderr': _stderr.getvalue(), 'exitCode': _exit_code})
\`);
          const parsed = JSON.parse(resultJson);
          self.postMessage({ type: 'result', ...parsed });
        } catch (err) {
          self.postMessage({
            type: 'result',
            stdout: '',
            stderr: err && err.message ? err.message : String(err),
            exitCode: 1,
          });
        }
      };
    `;

    const blob = new Blob([workerSource], {type: 'application/javascript'});
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    let settled = false;
    let execTimer: number | null = null;
    let execStart = performance.now();

    const cleanup = () => {
      if (execTimer !== null) window.clearTimeout(execTimer);
      worker.terminate();
      URL.revokeObjectURL(url);
    };

    // Safety cap for initial Pyodide CDN download (30s)
    const loadTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        stdout: '',
        stderr: 'Python runtime initialization timed out.',
        exitCode: 124,
        durationMs: Math.round(performance.now() - execStart),
        timedOut: true,
      });
    }, 30000);

    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'status') {
        onStatus?.(msg.message);
        return;
      }
      if (msg.type === 'executing') {
        window.clearTimeout(loadTimer);
        onStatus?.('Running Python...');
        execStart = performance.now();
        execTimer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve({
            stdout: '',
            stderr: `Python execution timed out after ${timeoutMs / 1000} seconds.`,
            exitCode: 124,
            durationMs: Math.round(performance.now() - execStart),
            timedOut: true,
          });
        }, timeoutMs);
        return;
      }
      if (msg.type === 'result') {
        if (settled) return;
        settled = true;
        window.clearTimeout(loadTimer);
        cleanup();
        resolve({
          stdout: msg.stdout ?? '',
          stderr: msg.stderr ?? '',
          exitCode: msg.exitCode ?? 0,
          durationMs: Math.round(performance.now() - execStart),
        });
      }
    };

    worker.onerror = (err) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(loadTimer);
      cleanup();
      resolve({
        stdout: '',
        stderr: err.message || 'Python worker error.',
        exitCode: 1,
        durationMs: Math.round(performance.now() - execStart),
      });
    };

    worker.postMessage({code, stdin});
  });
}
