// نصائح بيئة التشغيل: برنامج يحتاج ما لا يوفره مكان التشغيل (نافذة، عتاد، نظام ملفات) يفشل برسالة لا تشرح السبب.
// الأنماط مأخوذة من رسائل فعلية لـ Pyodide و Wandbox والمتصفح، ولا تطابق إلا أسطر الأخطاء، فبرنامج يطبع النص نفسه لا يتأثر.
// نص السبب بالعربية والإنجليزية في copy.ts، وأسماء البرامج هنا لأنها لا تُترجم
import type { WorkspaceCopy } from './copy'

export interface EnvironmentTip {
  languages: string[]
  error: RegExp
  reason: keyof WorkspaceCopy['environment']['reasons']
  tools: string[]
}

const PYTHON_TOOLS = ['VS Code', 'PyCharm', 'Thonny']
const C_TOOLS = ['VS Code', 'CLion', 'Code::Blocks']

const TIPS: EnvironmentTip[] = [
  {
    languages: ['python'],
    // window و screen بلا علامات اقتباس: رسالة JavaScript لا NameError من كود المستخدم، فهي تعني أن المكتبة بحثت عن شاشة
    error: /No module named '(?:_?tkinter|customtkinter|turtle|pygame|PyQt\d?|PySide\d?|wx|kivy|pyglet|arcade)\b|\b(?:window|document|screen) is not defined|cannot import name 'window' from 'js'|highgui/,
    reason: 'pythonGui',
    tools: PYTHON_TOOLS,
  },
  {
    languages: ['python'],
    error: /No module named '(?:serial|RPi|gpiozero|smbus2?|pyautogui|pynput|keyboard|mouse|pyaudio|sounddevice|pyttsx3|playsound|flask|django|fastapi|uvicorn)\b|does not support processes/,
    reason: 'pythonSystem',
    tools: PYTHON_TOOLS,
  },
  {
    languages: ['c', 'cpp'],
    error: /fatal error: (?:SFML\/|SDL2?[/.]|GL\/|GLFW\/|glad\/|X11\/|gtk\/|raylib\.h|allegro|windows\.h|winsock2?\.h|graphics\.h|conio\.h|dos\.h|Q[A-Z]\w+)[^\n]*: No such file/,
    reason: 'native',
    tools: C_TOOLS,
  },
  {
    languages: ['java'],
    error: /HeadlessException|AWTException: headless environment|package javafx[\w.]* does not exist/,
    reason: 'java',
    tools: ['IntelliJ IDEA', 'Eclipse', 'NetBeans'],
  },
  {
    languages: ['csharp'],
    // Mono يصف WPF كنوع مجهول لا كمكتبة ناقصة
    error: /namespace `System(?:\.Windows)?'\. Are you missing `System\.(?:Windows\.Forms|Drawing)'|CS0246: The type or namespace name `(?:Application|Window|MessageBox|Form)'/,
    reason: 'csharp',
    tools: ['Visual Studio', 'JetBrains Rider'],
  },
  {
    languages: ['javascript', 'html'],
    error: /\b(?:require|process|module|Buffer|__dirname|__filename) is not defined|Cannot use import statement outside a module/,
    reason: 'node',
    tools: ['VS Code', 'WebStorm'],
  },
  {
    languages: ['typescript'],
    // نقطة بداية الاسم تعني ملفاً محلياً مفقوداً، وهذا خطأ عادي لا نقص في البيئة
    error: /Cannot find module '[^.]|Cannot find name '(?:require|process|module|Buffer|__dirname|__filename)'/,
    reason: 'typescript',
    tools: ['VS Code', 'WebStorm'],
  },
  {
    languages: ['go'],
    // النقطة في أول مقطع تميز حزمة خارجية (github.com/...) عن خطأ إملائي في مكتبة Go القياسية
    error: /cannot find package "[\w-]+\.[\w.-]+\//,
    reason: 'go',
    tools: ['GoLand', 'VS Code'],
  },
  {
    languages: ['rust'],
    // قائمة بالأسماء لأن رسالة use خاطئة لوحدة محلية هي نفسها رسالة مكتبة ناقصة
    error: /(?:unresolved import|can't find crate for|undeclared crate or module) `(?:ggez|sdl2|winit|bevy|macroquad|iced|egui|eframe|gtk|wgpu|minifb|piston|tauri|rodio|cpal)`/,
    reason: 'rust',
    tools: ['RustRover', 'VS Code'],
  },
]

export function environmentTip(language: string, lines: { level: string; text: string }[]) {
  const errors = lines
    .filter((line) => line.level === 'error')
    .map((line) => line.text)
    .join('\n')
  return errors ? TIPS.find((tip) => tip.languages.includes(language) && tip.error.test(errors)) : undefined
}
