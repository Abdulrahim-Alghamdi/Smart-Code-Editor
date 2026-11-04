// نصائح بيئة التشغيل: برنامج يحتاج ما لا يوفره مكان التشغيل (نافذة، عتاد، نظام ملفات) يفشل برسالة لا تشرح السبب.
// الأنماط مأخوذة من رسائل فعلية لـ Pyodide و Wandbox والمتصفح، ولا تطابق إلا أسطر الأخطاء، فبرنامج يطبع النص نفسه لا يتأثر.
// النصوص بالإنجليزية عمداً، كما طُلبت
export interface EnvironmentTip {
  languages: string[]
  error: RegExp
  why: string
  tools: string[]
}

const PYTHON_TOOLS = ['VS Code', 'PyCharm', 'Thonny']
const C_TOOLS = ['VS Code', 'CLion', 'Code::Blocks']

const TIPS: EnvironmentTip[] = [
  {
    languages: ['python'],
    // window و screen بلا علامات اقتباس: رسالة JavaScript لا NameError من كود المستخدم، فهي تعني أن المكتبة بحثت عن شاشة
    error: /No module named '(?:_?tkinter|customtkinter|turtle|pygame|PyQt\d?|PySide\d?|wx|kivy|pyglet|arcade)\b|\b(?:window|document|screen) is not defined|cannot import name 'window' from 'js'|highgui/,
    why: 'This program opens a window or draws graphics. Python here runs in a browser sandbox, which has no desktop or display to draw on.',
    tools: PYTHON_TOOLS,
  },
  {
    languages: ['python'],
    error: /No module named '(?:serial|RPi|gpiozero|smbus2?|pyautogui|pynput|keyboard|mouse|pyaudio|sounddevice|pyttsx3|playsound|flask|django|fastapi|uvicorn)\b|does not support processes/,
    why: 'This program needs your operating system: hardware, other programs or open network ports. Python here runs in a browser sandbox, which blocks all of these.',
    tools: PYTHON_TOOLS,
  },
  {
    languages: ['c', 'cpp'],
    error: /fatal error: (?:SFML\/|SDL2?[/.]|GL\/|GLFW\/|glad\/|X11\/|gtk\/|raylib\.h|allegro|windows\.h|winsock2?\.h|graphics\.h|conio\.h|dos\.h|Q[A-Z]\w+)[^\n]*: No such file/,
    why: 'This program uses graphics, window or Windows-only libraries. Code here compiles on a Linux sandbox server with no display, and those libraries are not installed there.',
    tools: C_TOOLS,
  },
  {
    languages: ['java'],
    error: /HeadlessException|AWTException: headless environment|package javafx[\w.]* does not exist/,
    why: 'This program opens a window with Swing, AWT or JavaFX. Code here runs on a sandbox server that has no display.',
    tools: ['IntelliJ IDEA', 'Eclipse', 'NetBeans'],
  },
  {
    languages: ['csharp'],
    // Mono يصف WPF كنوع مجهول لا كمكتبة ناقصة
    error: /namespace `System(?:\.Windows)?'\. Are you missing `System\.(?:Windows\.Forms|Drawing)'|CS0246: The type or namespace name `(?:Application|Window|MessageBox|Form)'/,
    why: 'WinForms and WPF are Windows desktop frameworks. Code here runs on a Linux sandbox server without them, and with no display to show a window.',
    tools: ['Visual Studio', 'JetBrains Rider'],
  },
  {
    languages: ['javascript', 'html'],
    error: /\b(?:require|process|module|Buffer|__dirname|__filename) is not defined|Cannot use import statement outside a module/,
    why: 'This program needs Node.js: fs, Express and other modules only exist there. JavaScript here runs in a browser sandbox, which has no file system or server access.',
    tools: ['VS Code', 'WebStorm'],
  },
  {
    languages: ['typescript'],
    // نقطة بداية الاسم تعني ملفاً محلياً مفقوداً، وهذا خطأ عادي لا نقص في البيئة
    error: /Cannot find module '[^.]|Cannot find name '(?:require|process|module|Buffer|__dirname|__filename)'/,
    why: 'This program needs Node.js or npm packages. TypeScript here compiles in a sandbox that has neither, and it cannot install them.',
    tools: ['VS Code', 'WebStorm'],
  },
  {
    languages: ['go'],
    // النقطة في أول مقطع تميز حزمة خارجية (github.com/...) عن خطأ إملائي في مكتبة Go القياسية
    error: /cannot find package "[\w-]+\.[\w.-]+\//,
    why: 'This program needs a third-party package. The sandbox has only the Go standard library and cannot download modules, and it has no display for GUI toolkits.',
    tools: ['GoLand', 'VS Code'],
  },
  {
    languages: ['rust'],
    // قائمة بالأسماء لأن رسالة use خاطئة لوحدة محلية هي نفسها رسالة مكتبة ناقصة
    error: /(?:unresolved import|can't find crate for|undeclared crate or module) `(?:ggez|sdl2|winit|bevy|macroquad|iced|egui|eframe|gtk|wgpu|minifb|piston|tauri|rodio|cpal)`/,
    why: 'This program needs a graphics or audio crate. The sandbox compiles a single file with no Cargo packages, and it has no display or sound device.',
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
