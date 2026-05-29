# Pose Estimation Tauri

Тестовый проект — десктопное приложение на [Tauri v2](https://tauri.app/) с определением позы человека в реальном времени.

## Стек

- **Tauri 2** — оболочка десктопного приложения (Rust + WebView)
- **Vite + TypeScript** — фронтенд
- **RTMPose (ONNX)** — модель определения ключевых точек тела (COCO-17)
- **WebAssembly** — инференс модели в браузерном контексте

## Возможности

- Определение 17 ключевых точек тела (COCO формат)
- Отрисовка скелета с цветными костями
- Поддержка Android сборки

## Требования

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) (stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)
- Tauri CLI: `npm install`

## Запуск

```bash
# Установить зависимости
npm install

# Собрать WASM модуль
npm run wasm:build

# Запустить в режиме разработки
npm run tauri:dev

# Собрать релиз
npm run tauri:build
```

## Android

```bash
npm run android:init
npm run android:dev
npm run android:build
```

## Структура

```
├── src/              # TypeScript фронтенд
│   └── pose.ts       # Логика отрисовки скелета
├── src-tauri/        # Rust бэкенд (Tauri)
├── src-wasm/         # WebAssembly модуль
└── models/           # ONNX модели (rtmpose.onnx)
```
