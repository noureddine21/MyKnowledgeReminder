# My Knowledge Reminder

Offline Android app (React Native CLI + TypeScript) to save what you learn — Quran verses, Hadiths,
technical notes, French vocabulary, quotes — and get reminded to review it.

- 100 % local: SQLite on the device, no backend, no account.
- Reminders: one-time, custom date/time, **every N hours / days / weeks / months**, or a **smart review schedule**
  (default 1, 3, 7, 30 days after creation, customizable, optional).
- Local notifications that open the related item when tapped; restored after app restart and device reboot.

## Tech stack

| Concern | Library | Why |
| --- | --- | --- |
| App framework | React Native **0.86.3** (bare CLI, New Architecture) | Latest line compatible with Node 20.19+ |
| Database | `@op-engineering/op-sqlite` | Fast, maintained JSI SQLite driver; supports transactions |
| Notifications | `react-native-notify-kit` | Maintained, API-compatible fork of Notifee (Notifee itself is no longer published). AlarmManager triggers, daily/weekly/monthly repeat, reboot rescheduling, permission & battery helpers |
| Navigation | React Navigation 7 (native-stack + bottom-tabs) | Standard, typed navigation |
| Date/time pickers | `@react-native-community/datetimepicker` | Native Android dialogs |
| Icons | `@react-native-vector-icons/material-design-icons` | Fonts bundled automatically by Gradle |
| Tests | Jest + `sql.js` | Repositories/services run against a real SQLite engine in tests |

## Architecture

```
index.js                     registers the background notification handler, then the app
src/
  App.tsx                    bootstrap: open DB + migrations → settings → UI; startup resync
  models/                    domain types (Information, Category, Reminder, ReviewHistory, settings)
  constants/                 defaults (categories, intervals, limits, labels)
  database/
    connection.ts            single op-sqlite connection, PRAGMA foreign_keys, runs migrations
    types.ts                 driver-agnostic AppDatabase / SqlExecutor interfaces
    migrations/              versioned migrations (PRAGMA user_version)
    repositories/            one repository per table + transaction helper
    mappers.ts               row → model mapping
  services/
    reviewSchedule.ts        PURE scheduling logic (due today, recurrences, smart schedule)
    informationService.ts    CRUD + validation + reminder configuration
    reviewService.ts         Review Today, dashboard, mark reviewed, reschedule, toggle
    categoryService.ts       custom categories (delete moves items to "Other")
    settingsService.ts       persisted settings
    reminderSync.ts          keeps OS notifications in sync with SQLite (DB = source of truth)
    notificationService/     channel, scheduling, permissions, events, message texts
  hooks/                     useFocusData, useSettings, useNotificationPermission, useReviewActions…
  navigation/                stack + tabs, typed params, global navigationRef for notification taps
  components/                reusable UI (Card, Button, TextField, Chip, ReminderEditor, …)
  screens/                   Dashboard, Add/Edit, My Information, Details, Review Today,
                             Reminder Settings, Categories, Settings
  theme/                     light/dark tokens + ThemeProvider
  utils/                     dates, validation, centralized errors, picker helpers
```

Data flow: **Screen → hook → service → repository → SQLite**. Services then call
`reminderSync` to (re)schedule or cancel the item's notification. A notification failure never
rolls back saved data; it is reported to the user as a warning.

## Database schema

All timestamps are `INTEGER` epoch milliseconds; booleans are `INTEGER 0/1`.

```sql
categories (id PK, name TEXT UNIQUE NOCASE, color, icon, is_default, created_at)

information (id PK, title NOT NULL, content NOT NULL,
             category_id → categories(id) ON DELETE SET NULL,
             source, created_at, updated_at)
  INDEX (category_id), INDEX (created_at)

reminders (id PK, information_id UNIQUE → information(id) ON DELETE CASCADE,
           scheduled_at,            -- once/spaced: next review; hourly/daily/weekly/monthly: series anchor
           frequency CHECK IN ('once','hourly','daily','weekly','monthly','spaced'),
           repeat_interval CHECK 1..999,   -- "every N" units (migration 002)
           is_active, notification_id,
           spaced_step, spaced_base_at, last_reviewed_at,
           created_at, updated_at)
  INDEX (is_active, scheduled_at)

review_history (id PK, information_id → information(id) ON DELETE CASCADE,
                reviewed_at, status CHECK IN ('reviewed','rescheduled'))
  INDEX (information_id, reviewed_at)

settings (key PK, value)           -- theme, review intervals, defaults
```

To change the schema, add `src/database/migrations/00X_*.ts` and append it to `MIGRATIONS`.
Never edit a released migration.

## Reminder rules

- **One-time / custom**: fires once; "Mark as reviewed" completes it.
- **Every N hours / days / weeks / months** (`hourly`/`daily`/`weekly`/`monthly` + `repeat_interval`):
  the OS repeats the notification natively (AlarmManager). Day-based series appear in *Review Today*
  on each occurrence day (and stay there, marked *overdue*, until reviewed). Hourly series appear once
  an occurrence has fired, and a review counts for that occurrence only.
- Repeats more frequent than every hour are not offered: Android does not allow reliable repeating
  alarms below 15 minutes, and such repeats would be delivered late.
- **Smart schedule**: reviews at base date + each interval (time of day chosen by the user).
  Reviewing moves to the next step; a late step is moved to the next available slot;
  after the last step the reminder completes. Editing only the text keeps the progress.
- **Review later**: picks a new date/time; recurring series restart from that moment.

## Requirements

- Node **20.19.4+** (22 LTS recommended), JDK 17–21, Android SDK (API 36, build-tools 36.0.0, NDK 27.1.12297006)
- An Android device (USB debugging) or emulator, Android 7.0 (API 24) or later

## Run (development)

```bash
npm install
npm start            # Metro bundler (keep it running)
npm run android      # in a second terminal: build + install the debug app
```

## Test

```bash
npm test             # Jest: scheduling logic, validation, real-SQL repositories & services, components
npm run typecheck    # TypeScript
npm run lint         # ESLint
```

Manual checks on a device:

1. Add an item with a one-time reminder 2 minutes ahead → accept the notification permission →
   lock the phone → the notification arrives → tap it → the Details screen opens.
2. Kill the app from recent apps, wait for another reminder, tap it → the app opens on Details.
3. Reboot the phone with a reminder pending → it is still delivered.
4. Delete an item with a pending reminder → no notification arrives.
5. Settings → Appearance → Dark.

## Release build

1. Create an upload key once (keep it and its passwords safe — losing it blocks Play Store updates):

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore mkr-upload.keystore -alias mkr-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add to `%USERPROFILE%\.gradle\gradle.properties` (not to the project):

   ```properties
   MKR_UPLOAD_STORE_FILE=C:/path/to/mkr-upload.keystore
   MKR_UPLOAD_STORE_PASSWORD=*****
   MKR_UPLOAD_KEY_ALIAS=mkr-upload
   MKR_UPLOAD_KEY_PASSWORD=*****
   ```

3. Build:

   ```bash
   npm run android:release   # APK  → android/app/build/outputs/apk/release/app-release.apk
   npm run android:bundle    # AAB  → android/app/build/outputs/bundle/release/app-release.aab (Play Store)
   ```

   Without these properties the release build is signed with the debug key (fine for sideloading tests only).
   Bump `versionCode` / `versionName` in `android/app/build.gradle` for every release.

## Notifications

Each reminder notification:

- shows the category (colour + name) and, when expanded, the beginning of the saved content and its source;
- has quick actions that work **without opening the app** (also when the app is killed):
  - **✓ Reviewed**: records the review in SQLite and moves the reminder to its next step;
  - **Snooze 10 min / Snooze 1 h**: shows the same reminder again later, without changing the schedule
    (separate one-off notification `snooze-<id>`, cleared when the item is reviewed, rescheduled, edited or deleted);
- is grouped with other reminders; tapping it opens the item's Details screen.

If an action fails (e.g. the item was deleted), a notification asks to open the app instead of failing silently.
Screens that are open refresh automatically after an action.

## Share from other apps (Instagram, YouTube, Chrome…)

In any app, tap **Share → Add to My Knowledge Reminder**. The app opens the **Add** form pre-filled:

- the shared link goes to **Source** (e.g. the Instagram reel URL);
- the title is the page title when the app provides one, else the first line of the shared text,
  else a name like "Instagram reel" / "YouTube video";
- remaining shared text goes to **Content**.

Nothing is saved automatically: you write the key point to remember and tap **Save**.
Only what the other app shares is used (usually just a link): the app stays offline and does
not download or read the reel itself.

How it works: `MainActivity` receives the `ACTION_SEND` (`text/plain`) intent and converts it into an
internal `myknowledgereminder://share?text=…&subject=…` link, which `src/services/shareIntake.ts`
receives through React Native's `Linking` API (cold start and while running).

## Android notification notes (no exact-delivery promise)

- Android 13+: the app asks for notification permission when you first save a reminder.
  If denied, data is still saved; Settings → Reminder settings shows the status and opens system settings.
- Android 12+: exact alarms need the "Alarms & reminders" special access. When it is not granted the app
  falls back to inexact alarms, which Android may deliver several minutes late.
- Doze, battery saver and some manufacturers (Xiaomi, Huawei, Samsung, OnePlus…) can delay or block
  notifications. Exclude the app from battery optimization from Reminder settings. *Review Today* always
  shows what is due, even if a notification was delayed or missed.
- Pending reminders are rescheduled after a reboot by the notification library and re-synced from
  SQLite each time the app starts.

## Known limitations

- Android only (iOS project exists from the template but is not configured or tested).
- No backup/export yet: uninstalling or clearing app data deletes everything.
- A daily reminder reviewed earlier the same day still shows its notification at the scheduled time.
- Changing the smart-schedule intervals affects new items and the *next* steps of existing ones.
