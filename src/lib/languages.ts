export interface LanguageMeta {
  id: string;
  name: string;
  extension: string;
  category: 'Web' | 'Python' | 'JavaScript' | 'Other';
  color: string;
  monacoId: string;
  runtimeSupport: 'browser' | 'sandbox' | 'preview';
  runtimeNote: string;
  starterFile: string;
  starterContent: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
  {
    id: 'typescript',
    name: 'TypeScript',
    extension: 'ts',
    category: 'JavaScript',
    color: '#3178c6',
    monacoId: 'typescript',
    runtimeSupport: 'browser',
    runtimeNote: 'Transpiled & executed in browser Worker',
    starterFile: 'index.ts',
    starterContent: `function greet(name: string): string {\n  return \`Hello from Arix AI, \${name}!\`;\n}\n\nconsole.log(greet("Developer"));\n`,
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    extension: 'js',
    category: 'JavaScript',
    color: '#f7df1e',
    monacoId: 'javascript',
    runtimeSupport: 'browser',
    runtimeNote: 'Sandboxed browser Worker (5s timeout)',
    starterFile: 'index.js',
    starterContent: `function greet(name) {\n  return \`Hello from Arix AI, \${name}!\`;\n}\n\nconsole.log(greet("Developer"));\n`,
  },
  {
    id: 'python',
    name: 'Python',
    extension: 'py',
    category: 'Python',
    color: '#3776ab',
    monacoId: 'python',
    runtimeSupport: 'browser',
    runtimeNote: 'Pyodide WebAssembly Worker (5s timeout)',
    starterFile: 'main.py',
    starterContent: `def greet(name: str) -> str:\n    return f"Hello from Arix AI, {name}!"\n\nif __name__ == "__main__":\n    print(greet("Developer"))\n`,
  },
  {
    id: 'html',
    name: 'HTML',
    extension: 'html',
    category: 'Web',
    color: '#e34f26',
    monacoId: 'html',
    runtimeSupport: 'preview',
    runtimeNote: 'Sandboxed live iframe preview',
    starterFile: 'index.html',
    starterContent: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>Arix Project</title>\n</head>\n<body>\n  <h1>Hello from Arix AI</h1>\n</body>\n</html>\n`,
  },
  {
    id: 'css',
    name: 'CSS',
    extension: 'css',
    category: 'Web',
    color: '#264de4',
    monacoId: 'css',
    runtimeSupport: 'preview',
    runtimeNote: 'Previewed alongside HTML',
    starterFile: 'styles.css',
    starterContent: `:root {\n  --accent: #4f6bff;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n  margin: 0;\n  padding: 2rem;\n}\n`,
  },
  {
    id: 'java',
    name: 'Java',
    extension: 'java',
    category: 'Other',
    color: '#f89820',
    monacoId: 'java',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'Main.java',
    starterContent: `public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from Arix AI!");\n  }\n}\n`,
  },
  {
    id: 'c',
    name: 'C',
    extension: 'c',
    category: 'Other',
    color: '#a8b9cc',
    monacoId: 'c',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'main.c',
    starterContent: `#include <stdio.h>\n\nint main(void) {\n  printf("Hello from Arix AI!\\n");\n  return 0;\n}\n`,
  },
  {
    id: 'cpp',
    name: 'C++',
    extension: 'cpp',
    category: 'Other',
    color: '#00599c',
    monacoId: 'cpp',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'main.cpp',
    starterContent: `#include <iostream>\n\nint main() {\n  std::cout << "Hello from Arix AI!" << std::endl;\n  return 0;\n}\n`,
  },
  {
    id: 'csharp',
    name: 'C#',
    extension: 'cs',
    category: 'Other',
    color: '#512bd4',
    monacoId: 'csharp',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'Program.cs',
    starterContent: `using System;\n\nclass Program {\n  static void Main() {\n    Console.WriteLine("Hello from Arix AI!");\n  }\n}\n`,
  },
  {
    id: 'php',
    name: 'PHP',
    extension: 'php',
    category: 'Web',
    color: '#777bb4',
    monacoId: 'php',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'index.php',
    starterContent: `<?php\necho "Hello from Arix AI!\\n";\n`,
  },
  {
    id: 'sql',
    name: 'SQL',
    extension: 'sql',
    category: 'Other',
    color: '#06b6d4',
    monacoId: 'sql',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'query.sql',
    starterContent: `SELECT 'Hello from Arix AI' AS greeting;\n`,
  },
  {
    id: 'go',
    name: 'Go',
    extension: 'go',
    category: 'Other',
    color: '#00add8',
    monacoId: 'go',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'main.go',
    starterContent: `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from Arix AI!")\n}\n`,
  },
  {
    id: 'rust',
    name: 'Rust',
    extension: 'rs',
    category: 'Other',
    color: '#dea584',
    monacoId: 'rust',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'main.rs',
    starterContent: `fn main() {\n    println!("Hello from Arix AI!");\n}\n`,
  },
  {
    id: 'ruby',
    name: 'Ruby',
    extension: 'rb',
    category: 'Other',
    color: '#cc342d',
    monacoId: 'ruby',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'main.rb',
    starterContent: `puts "Hello from Arix AI!"\n`,
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    extension: 'kt',
    category: 'Other',
    color: '#7f52ff',
    monacoId: 'kotlin',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'Main.kt',
    starterContent: `fun main() {\n    println("Hello from Arix AI!")\n}\n`,
  },
  {
    id: 'swift',
    name: 'Swift',
    extension: 'swift',
    category: 'Other',
    color: '#f05138',
    monacoId: 'swift',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'main.swift',
    starterContent: `print("Hello from Arix AI!")\n`,
  },
  {
    id: 'bash',
    name: 'Bash',
    extension: 'sh',
    category: 'Other',
    color: '#4eaa25',
    monacoId: 'shell',
    runtimeSupport: 'sandbox',
    runtimeNote: 'Remote sandbox API or AI-predicted fallback',
    starterFile: 'script.sh',
    starterContent: `#!/usr/bin/env bash\necho "Hello from Arix AI!"\n`,
  },
];

export const EXTRA_FILE_ICONS: Record<string, {label: string; color: string}> = {
  md: {label: 'MD', color: '#94a3b8'},
  json: {label: 'JSON', color: '#f59e0b'},
};

export function getLanguageById(id: string): LanguageMeta {
  return (
    SUPPORTED_LANGUAGES.find((l) => l.id === id) ?? SUPPORTED_LANGUAGES[0]
  );
}

export function getFileIconMeta(filename: string): {label: string; color: string} {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const lang = SUPPORTED_LANGUAGES.find((l) => l.extension === ext);
  if (lang) {
    return {label: lang.extension.toUpperCase(), color: lang.color};
  }
  if (EXTRA_FILE_ICONS[ext]) {
    return EXTRA_FILE_ICONS[ext];
  }
  return {label: ext ? ext.slice(0, 4).toUpperCase() : 'FILE', color: '#64748b'};
}
