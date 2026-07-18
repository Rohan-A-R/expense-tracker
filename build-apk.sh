#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "🔨 Building web app..."
npm run build

echo "📱 Syncing to Android..."
npx cap sync android

echo "🔧 Building APK..."
cd android && ANDROID_HOME=$HOME/Android/Sdk ./gradlew assembleDebug --quiet && cd ..

cp android/app/build/outputs/apk/debug/app-debug.apk ~/Desktop/ExpenseTracker.apk

echo ""
echo "✅ Done! APK saved to ~/Desktop/ExpenseTracker.apk"
echo "📲 Send it to your phone via WhatsApp or Telegram and install."
