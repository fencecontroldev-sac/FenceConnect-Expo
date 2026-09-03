# Fence Connect — test on iPhone from Windows

This Expo app retains the current MIT App Inventor Firebase Realtime Database layout. It contains the login, control dashboard, automatic timer, history, customer creation/search, live-machine list, restriction control, and Wi-Fi configuration screens.

## One-time setup on Windows

1. Install the current **Node.js LTS** release from [nodejs.org](https://nodejs.org/). This provides the missing `npm` command.
2. Install **Expo Go** from the iPhone App Store.

## Run on the iPhone

Double-click **Start Fence Connect.bat** in this folder. A window will show a QR code.

Alternatively, open PowerShell in this folder and run:

```powershell
npm install
npx expo start --lan
```

Ensure the iPhone and Windows PC use the same Wi-Fi network. In the Expo page that opens, scan the QR code using the iPhone Camera, then choose **Open in Expo Go**.

If the QR scan does not connect, run `npx expo start --tunnel` instead. Do not use it for real fence control until the login and commands have been tested on a safe test machine.

## Security note

This intentionally uses the existing direct REST access and password comparison so it works with the Android project. It should not be published to the App Store until Firebase Authentication and database rules (or a secure server API) are added.
