npm run build
npm run build:android
npx cap sync android
cd android && GRADLE_USER_HOME=../.gradle ./gradlew assembleDebug
# install to a plugged-in device with USB debugging on:
adb install -r app/build/outputs/apk/debug/app-debug.apk