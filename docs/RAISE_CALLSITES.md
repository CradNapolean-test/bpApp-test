# `raise(` call sites in `lib/data` (report only)

Generated from the source on 15 Oct 2026 (brief 10). **Nothing in `lib/data` was changed for this report**: every other brief owns some of these files, so the owner routes each item below to the right brief.

## Why it matters

In production, an error **thrown** inside a Server Action reaches the browser as a generic message ("An error occurred in the Server Components render…"). `raise(error)` throws, so a function that uses it shows members and coaches a useless failure, whatever the database said ("Not enough credits", "That slot is full"). The fix is the `ActionResult` pattern already used elsewhere (`lib/data/result.ts`): return `fail(error, 'a friendly fallback')` and let `useAction` show it. Reads (`get…`) that throw are different: the screen that calls them decides how to show a failed read, and several already retry (brief 08).

## Summary

How it was worked out: by reading the source, not by running it. A function counts as a *read* when its name starts with get, list, search, load, fetch, count, has, find or read; everything else is treated as a *write*. "Called from" is every file under `app/` (and `lib/` outside `lib/data`) that mentions the function by name, so it can include a mention that is not a call. Treat the lists as a map to check, not as a verdict.

| | Count |
|---|---|
| `raise(` calls found | 250 in 208 functions |
| In functions a screen can call (exported from a `'use server'` file) | 198 functions |
| of which already return an `ActionResult` or `fail(...)` for domain errors | 10 (still throw on some paths; see the "Mixed" table) |
| of which only throw, and write data (**fix first**) | 110 |
| of which only throw, and read data | 78 |
| In helpers not callable from a screen | 10 |

## 1. Writes that only throw (fix first)

A person pressing a button here gets the generic production message when the database refuses. Convert to `ActionResult`.

| File:line | Function | Called from | Calls |
|---|---|---|---|
| `lib/data/bigDog.ts:44` | `recordBigDogResult` | `dashboard/_components/BigDogTab.tsx` | 1 |
| `lib/data/chat.ts:102` | `sendMessage` | `dashboard/_components/ChatTab.tsx` | 1 |
| `lib/data/chat.ts:139` | `markChatRead` | `coach/_components/useCoachMessages.ts`, `dashboard/_components/ChatTab.tsx` | 1 |
| `lib/data/chat.ts:146` | `markChatUnread` | `coach/_components/useCoachMessages.ts` | 1 |
| `lib/data/classes.ts:53` | `createClass` | `coach/classes/_components/TimetableView.tsx` | 1 |
| `lib/data/classes.ts:74` | `createClasses` | (none found) | 1 |
| `lib/data/clientExerciseMaxes.ts:33` | `recordExerciseMax` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/clientGroups.ts:63` | `addClientsToGroup` | `coach/_components/GroupsManager.tsx` | 1 |
| `lib/data/clientGroups.ts:70` | `removeClientsFromGroup` | `coach/_components/GroupsManager.tsx` | 1 |
| `lib/data/clientGroups.ts:76` | `addClientToGroup` | (none found) | 1 |
| `lib/data/clientGroups.ts:86` | `removeClientFromGroup` | (none found) | 1 |
| `lib/data/clientJournal.ts:33` | `addJournalEntry` | `coach/_components/workspace/NotesTab.tsx` | 1 |
| `lib/data/clientJournal.ts:39` | `deleteJournalEntry` | `coach/_components/workspace/NotesTab.tsx` | 1 |
| `lib/data/clientScreenSettings.ts:18` | `setScreenEnabled` | (none found) | 2 |
| `lib/data/communications.ts:110` | `deleteCommunication` | `coach/messages/_components/BroadcastsPane.tsx` | 1 |
| `lib/data/dailyLogs.ts:92` | `upsertDailyLog` | `dashboard/_components/WeeklyLogTab.tsx` | 1 |
| `lib/data/education.ts:42` | `createCourse` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:48` | `updateCourse` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:54` | `updateModule` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:60` | `deleteCourse` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:71` | `addModule` | `coach/library/_components/EducationPane.tsx` | 2 |
| `lib/data/education.ts:81` | `deleteModule` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:92` | `reorderModules` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:113` | `addLesson` | `coach/library/_components/EducationPane.tsx` | 2 |
| `lib/data/education.ts:129` | `updateLesson` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:135` | `deleteLesson` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:144` | `reorderLessons` | `coach/library/_components/EducationPane.tsx` | 1 |
| `lib/data/education.ts:203` | `markLessonComplete` | `dashboard/_components/EducationTab.tsx` | 1 |
| `lib/data/education.ts:213` | `markLessonIncomplete` | `dashboard/_components/EducationTab.tsx` | 1 |
| `lib/data/exerciseLibrary.ts:69` | `createLibraryExercise` | `coach/library/_components/ExerciseLibraryManager.tsx` | 1 |
| `lib/data/exerciseLibrary.ts:88` | `bulkCreateLibraryExercises` | `coach/library/_components/ExerciseLibraryManager.tsx` | 1 |
| `lib/data/exerciseLibrary.ts:98` | `updateLibraryExercise` | `coach/library/_components/ExerciseLibraryManager.tsx` | 1 |
| `lib/data/foodDiary.ts:42` | `addFoodDiaryEntry` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/foodDiary.ts:66` | `addQuickAddEntry` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/foodDiary.ts:89` | `updateQuickAddEntry` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/foodDiary.ts:96` | `removeFoodDiaryEntry` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/foodDiary.ts:108` | `updateFoodDiaryEntrySection` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/foodDiary.ts:116` | `updateFoodDiaryEntryPortions` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/foodDiary.ts:152` | `copyDiaryEntries` | (none found) | 2 |
| `lib/data/foodDiary.ts:183` | `syncFoodDiaryToLog` | (none found) | 1 |
| `lib/data/foodPhotos.ts:63` | `uploadFoodPhoto` | `dashboard/_components/PhotoDiaryTab.tsx` | 2 |
| `lib/data/foodPhotos.ts:91` | `deleteFoodPhoto` | `dashboard/_components/PhotoDiaryTab.tsx` | 3 |
| `lib/data/foodPhotos.ts:113` | `syncFoodPhotosToLog` | `api/estimate-food-photo/route.ts` | 2 |
| `lib/data/foods.ts:76` | `upsertFoodFromBarcode` | `dashboard/_components/FoodEntryTools.tsx` | 1 |
| `lib/data/foods.ts:133` | `isFavoriteFood` | (none found) | 1 |
| `lib/data/foods.ts:141` | `setFavoriteFood` | `dashboard/_components/FoodEntryTools.tsx` | 2 |
| `lib/data/habits.ts:52` | `createHabit` | (none found) | 1 |
| `lib/data/habits.ts:58` | `deleteHabit` | (none found) | 1 |
| `lib/data/habits.ts:66` | `toggleHabitLog` | (none found) | 1 |
| `lib/data/manualMacros.ts:63` | `addManualMacroEntry` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/manualMacros.ts:83` | `updateManualMacroEntry` | (none found) | 1 |
| `lib/data/manualMacros.ts:90` | `removeManualMacroEntry` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/manualMacros.ts:102` | `syncManualMacrosToLog` | (none found) | 1 |
| `lib/data/mealPlan.ts:41` | `addMealPlanEntry` | `dashboard/_components/MealPlannerTab.tsx` | 1 |
| `lib/data/mealPlan.ts:47` | `updateMealPlanEntryPortions` | `dashboard/_components/MealPlannerTab.tsx` | 1 |
| `lib/data/mealPlan.ts:53` | `removeMealPlanEntry` | `dashboard/_components/MealPlannerTab.tsx` | 1 |
| `lib/data/mealSections.ts:53` | `createMealSection` | `dashboard/_components/FoodTrackingTab.tsx` | 2 |
| `lib/data/mealSections.ts:63` | `renameMealSection` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/mealSections.ts:74` | `reorderMealSections` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/mealSections.ts:80` | `deleteMealSection` | `dashboard/_components/FoodTrackingTab.tsx` | 1 |
| `lib/data/notifications.ts:45` | `markAllNotificationsRead` | `dashboard/_components/NotificationsTab.tsx` | 1 |
| `lib/data/notifications.ts:54` | `markRead` | `coach/_components/MessagesDrawer.tsx`, `coach/_components/useCoachMessages.ts`, `coach/messages/_components/MessagesHubShell.tsx` | 1 |
| `lib/data/notifications.ts:62` | `clearNotification` | `dashboard/_components/NotificationsTab.tsx` | 1 |
| `lib/data/notifications.ts:73` | `clearAllNotifications` | `dashboard/_components/NotificationsTab.tsx` | 1 |
| `lib/data/programTemplates.ts:73` | `updateProgramTemplate` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:91` | `createProgramTemplateAndGetId` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:105` | `deleteTemplateWeek` | `coach/library/_components/ProgramTemplateManager.tsx` | 3 |
| `lib/data/programTemplates.ts:126` | `deleteProgramTemplate` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:139` | `addTemplateDay` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:145` | `deleteTemplateDay` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:156` | `addTemplateExercise` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:162` | `deleteTemplateExercise` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:173` | `reorderTemplateExercises` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:182` | `updateTemplateExercise` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:194` | `updateTemplateExercises` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:203` | `updateTemplateDay` | `coach/library/_components/ProgramTemplateManager.tsx` | 1 |
| `lib/data/programTemplates.ts:215` | `duplicateTemplateDay` | `coach/library/_components/ProgramTemplateManager.tsx` | 4 |
| `lib/data/programTemplates.ts:274` | `applyFieldsToTemplateDay` | (none found) | 1 |
| `lib/data/progress.ts:45` | `uploadProgressPhoto` | `dashboard/_components/ProgressTab.tsx` | 2 |
| `lib/data/progress.ts:67` | `deletePhoto` | `dashboard/_components/ProgressTab.tsx` | 3 |
| `lib/data/progress.ts:100` | `addMeasurementLog` | `dashboard/_components/ProgressTab.tsx` | 1 |
| `lib/data/pushSubscriptions.ts:19` | `registerPushSubscription` | `_components/pushNotifications.ts` | 2 |
| `lib/data/pushSubscriptions.ts:38` | `deletePushSubscription` | `_components/pushNotifications.ts` | 1 |
| `lib/data/recipes.ts:39` | `createRecipe` | `dashboard/_components/RecipesTab.tsx` | 1 |
| `lib/data/recipes.ts:49` | `renameRecipe` | `dashboard/_components/RecipesTab.tsx` | 1 |
| `lib/data/recipes.ts:55` | `updateRecipeServings` | `dashboard/_components/RecipesTab.tsx` | 1 |
| `lib/data/recipes.ts:61` | `deleteRecipe` | `dashboard/_components/RecipesTab.tsx` | 1 |
| `lib/data/recipes.ts:69` | `addRecipeIngredient` | `dashboard/_components/RecipesTab.tsx` | 1 |
| `lib/data/recipes.ts:75` | `updateRecipeIngredientPortions` | `dashboard/_components/RecipesTab.tsx` | 1 |
| `lib/data/recipes.ts:81` | `removeRecipeIngredient` | `dashboard/_components/RecipesTab.tsx` | 1 |
| `lib/data/recipes.ts:100` | `logRecipeToDiary` | `dashboard/_components/FoodTrackingTab.tsx` | 3 |
| `lib/data/recipes.ts:137` | `addRecipeToMealPlan` | `dashboard/_components/MealPlannerTab.tsx` | 3 |
| `lib/data/workoutDayFeedback.ts:32` | `submitDayFeedback` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:21` | `createProgram` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:30` | `updateProgram` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:36` | `deleteProgram` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:49` | `addProgramDay` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:55` | `deleteProgramDay` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:65` | `deleteProgramWeek` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:76` | `addExercise` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:82` | `deleteExercise` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:93` | `reorderExercises` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:102` | `updateExercise` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:113` | `updateExercises` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:122` | `updateProgramDay` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:136` | `duplicateProgramDay` | `dashboard/_components/WorkoutTab.tsx` | 4 |
| `lib/data/workouts.ts:194` | `applyFieldsToDay` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:244` | `logSet` | `dashboard/_components/WorkoutTab.tsx` | 2 |
| `lib/data/workouts.ts:268` | `updateSet` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/workouts.ts:275` | `deleteSet` | `dashboard/_components/WorkoutTab.tsx` | 1 |

## 2. Mixed: return a result for some errors, still throw on others

These already use `fail(...)`/`ActionResult` for the common cases; the remaining `raise(` lines are the leftovers to convert.

| File:line | Function | Called from | Calls |
|---|---|---|---|
| `lib/data/clientGroups.ts:43` | `createGroup` | `coach/_components/GroupsManager.tsx` | 1 |
| `lib/data/forms.ts:71` | `createFormTemplate` | `coach/library/_components/FormsPane.tsx` | 3 |
| `lib/data/forms.ts:114` | `deleteFormTemplate` | `coach/library/_components/FormsPane.tsx` | 1 |
| `lib/data/memberships.ts:58` | `createPackage` | `coach/classes/_components/PackageManager.tsx` | 1 |
| `lib/data/memberships.ts:70` | `updatePackage` | `coach/classes/_components/PackageManager.tsx` | 1 |
| `lib/data/memberships.ts:102` | `deletePackage` | `coach/classes/_components/PackageManager.tsx` | 1 |
| `lib/data/memberships.ts:163` | `createCreditPack` | `coach/classes/_components/CreditPackManager.tsx` | 1 |
| `lib/data/memberships.ts:175` | `updateCreditPack` | `coach/classes/_components/CreditPackManager.tsx` | 1 |
| `lib/data/memberships.ts:183` | `deleteCreditPack` | `coach/classes/_components/CreditPackManager.tsx` | 1 |
| `lib/data/programTemplates.ts:64` | `createProgramTemplate` | (none found) | 1 |

## 3. Reads that throw

Acceptable where the calling screen handles a failed read (an error state with Try again). Check each screen; the owner screens were done in brief 08.

| File:line | Function | Called from | Calls |
|---|---|---|---|
| `lib/data/activity.ts:13` | `getRecentActivity` | (none found) | 1 |
| `lib/data/bigDog.ts:25` | `getBigDogResults` | (none found) | 1 |
| `lib/data/bigDog.ts:133` | `getBigDogShirts` | `coach/business/page.tsx` | 1 |
| `lib/data/bigDog.ts:173` | `getScoresExport` | `coach/community/_components/CommunityShell.tsx` | 1 |
| `lib/data/bodyScans.ts:25` | `getBodyScans` | (none found) | 1 |
| `lib/data/chat.ts:52` | `getMessages` | `coach/_components/useCoachMessages.ts`, `dashboard/_components/ChatTab.tsx` | 1 |
| `lib/data/chat.ts:67` | `getEarlierMessages` | `dashboard/_components/ChatTab.tsx` | 1 |
| `lib/data/chat.ts:84` | `getMessagesSince` | `dashboard/_components/ChatTab.tsx` | 1 |
| `lib/data/chat.ts:132` | `getCoachChatOverview` | `coach/_components/MessagesDrawer.tsx`, `coach/_components/useCoachMessages.ts`, `coach/clients/page.tsx`, `coach/messages/page.tsx` | 1 |
| `lib/data/chat.ts:158` | `getClientUnreadCount` | `dashboard/_components/DashboardShell.tsx` | 2 |
| `lib/data/classes.ts:33` | `getClasses` | `coach/classes/page.tsx` | 1 |
| `lib/data/classes.ts:159` | `getRecentAndUpcomingBookings` | (none found) | 1 |
| `lib/data/classes.ts:207` | `getCreditsBalance` | (none found) | 1 |
| `lib/data/classes.ts:222` | `getCreditsBucketBalances` | (none found) | 1 |
| `lib/data/classes.ts:237` | `getCreditsLedger` | (none found) | 1 |
| `lib/data/classes.ts:283` | `getScheduleOccurrences` | `coach/classes/page.tsx` | 3 |
| `lib/data/classes.ts:460` | `getRoster` | `coach/classes/_components/SessionsView.tsx` | 2 |
| `lib/data/clientExerciseMaxes.ts:14` | `getClientExerciseMaxes` | (none found) | 1 |
| `lib/data/clientGroups.ts:19` | `getGroups` | `coach/clients/page.tsx`, `coach/library/page.tsx`, `coach/messages/page.tsx` | 1 |
| `lib/data/clientJournal.ts:14` | `getJournalEntries` | `coach/clients/[clientId]/page.tsx` | 1 |
| `lib/data/clientProfile.ts:17` | `getClientProfile` | (none found) | 1 |
| `lib/data/clientProfile.ts:181` | `getClientCoachNotes` | `coach/_components/workspace/NotesTab.tsx` | 1 |
| `lib/data/clientScreenSettings.ts:10` | `getDisabledScreens` | (none found) | 1 |
| `lib/data/clientScreenSettings.ts:46` | `getDisabledMetrics` | (none found) | 1 |
| `lib/data/communications.ts:23` | `getCommunications` | `coach/messages/page.tsx` | 1 |
| `lib/data/community.ts:25` | `getUpcomingEvents` | `coach/business/page.tsx` | 1 |
| `lib/data/community.ts:52` | `getPastEvents` | `coach/business/page.tsx` | 1 |
| `lib/data/community.ts:162` | `getEventAttendees` | `coach/community/_components/CommunityShell.tsx` | 1 |
| `lib/data/community.ts:195` | `getRecentFeedback` | `coach/business/page.tsx` | 1 |
| `lib/data/dailyLogs.ts:21` | `getDailyLogs` | `dashboard/_components/WeeklyLogTab.tsx` | 1 |
| `lib/data/dailyLogs.ts:33` | `getDailyLog` | (none found) | 1 |
| `lib/data/dailyLogs.ts:48` | `getLoggedDates` | (none found) | 1 |
| `lib/data/dailyLogs.ts:62` | `getFirstLoggedDate` | (none found) | 1 |
| `lib/data/dailyLogs.ts:76` | `getOrCreateDailyLog` | `dashboard/_components/FoodTrackingTab.tsx`, `dashboard/_components/PhotoDiaryTab.tsx`, `lib/utils/dailyLog.ts` | 1 |
| `lib/data/education.ts:27` | `getCourses` | `coach/library/page.tsx` | 1 |
| `lib/data/education.ts:160` | `getClientCourseAssignments` | (none found) | 2 |
| `lib/data/exerciseLibrary.ts:11` | `getExerciseLibrary` | `coach/library/page.tsx` | 1 |
| `lib/data/exerciseLibrary.ts:22` | `getExerciseLibraryByIds` | (none found) | 1 |
| `lib/data/exerciseLibrary.ts:30` | `getExerciseOptions` | `dashboard/_components/WorkoutTab.tsx` | 1 |
| `lib/data/foodDiary.ts:28` | `getFoodDiaryEntries` | (none found) | 1 |
| `lib/data/foodPhotos.ts:36` | `getFoodPhotos` | (none found) | 1 |
| `lib/data/foods.ts:22` | `searchFoods` | `dashboard/_components/FoodSearchPicker.tsx` | 1 |
| `lib/data/foods.ts:93` | `searchScannedFoods` | `coach/library/_components/FoodsPane.tsx` | 1 |
| `lib/data/foods.ts:110` | `getActivities` | (none found) | 1 |
| `lib/data/foods.ts:121` | `getFavoriteFoods` | `dashboard/_components/FoodEntryTools.tsx` | 1 |
| `lib/data/foods.ts:167` | `getRecentlyLoggedFoods` | `dashboard/_components/FoodEntryTools.tsx` | 1 |
| `lib/data/forms.ts:25` | `getFormTemplates` | `coach/library/page.tsx` | 1 |
| `lib/data/forms.ts:41` | `getFormTemplateWithQuestions` | `coach/library/_components/FormsPane.tsx` | 1 |
| `lib/data/forms.ts:124` | `getClientFormAssignments` | (none found) | 1 |
| `lib/data/gym.ts:42` | `getGymRoster` | `coach/classes/_components/RedFlagsView.tsx`, `coach/settings/page.tsx` | 1 |
| `lib/data/gym.ts:93` | `getMyGyms` | `coach/layout.tsx`, `coach/library/page.tsx`, `coach/settings/page.tsx` | 1 |
| `lib/data/habits.ts:25` | `getHabitsWithLogs` | (none found) | 2 |
| `lib/data/manualMacros.ts:43` | `getManualMacroEntries` | (none found) | 1 |
| `lib/data/mealPlan.ts:27` | `getMealPlanEntries` | (none found) | 1 |
| `lib/data/mealSections.ts:16` | `getMealSections` | (none found) | 1 |
| `lib/data/mealSections.ts:41` | `getOrCreateMealSections` | (none found) | 1 |
| `lib/data/memberships.ts:27` | `getPackagesForGym` | (none found) | 1 |
| `lib/data/memberships.ts:39` | `getPackages` | `coach/business/page.tsx` | 1 |
| `lib/data/memberships.ts:113` | `getMyMembership` | (none found) | 1 |
| `lib/data/memberships.ts:133` | `getCreditPacksForGym` | (none found) | 1 |
| `lib/data/memberships.ts:145` | `getCreditPacks` | `coach/business/page.tsx` | 1 |
| `lib/data/notifications.ts:26` | `getNotifications` | (none found) | 2 |
| `lib/data/programTemplates.ts:25` | `getProgramTemplates` | (none found) | 1 |
| `lib/data/programTemplates.ts:37` | `getProgramTemplatesWithDays` | `coach/library/page.tsx` | 1 |
| `lib/data/programTemplates.ts:48` | `getProgramTemplateWithDays` | (none found) | 1 |
| `lib/data/progress.ts:19` | `getPhotos` | (none found) | 1 |
| `lib/data/progress.ts:85` | `getMeasurementLogs` | `lib/utils/measurementDeltas.test.ts`, `lib/utils/measurementDeltas.ts` | 1 |
| `lib/data/pushSubscriptions.ts:44` | `getPushSubscriptionsForClient` | (none found) | 1 |
| `lib/data/recipes.ts:15` | `getRecipes` | (none found) | 1 |
| `lib/data/recipes.ts:26` | `getRecipesWithIngredients` | (none found) | 1 |
| `lib/data/reports.ts:25` | `getCoachReport` | `coach/classes/page.tsx` | 3 |
| `lib/data/rewards.ts:20` | `getRewardsForMember` | (none found) | 1 |
| `lib/data/rewards.ts:44` | `getRewardOverview` | `coach/business/page.tsx` | 1 |
| `lib/data/runClass.ts:55` | `getRunClassData` | `coach/run/[classId]/[date]/page.tsx`, `coach/run/[classId]/[date]/tv/page.tsx` | 2 |
| `lib/data/workoutDayFeedback.ts:13` | `getWorkoutDayFeedback` | (none found) | 1 |
| `lib/data/workouts.ts:14` | `getPrograms` | (none found) | 1 |
| `lib/data/workouts.ts:205` | `getWorkoutLogs` | (none found) | 1 |
| `lib/data/workouts.ts:214` | `getStrengthBests` | `dashboard/_components/StrengthTab.tsx` | 1 |

## 4. Helpers (not callable from a screen)

Listed for completeness; their callers are the functions above.

| File:line | Function | Called from | Calls |
|---|---|---|---|
| `lib/data/coach.ts:23` | `resolveScopingCoachId` | (none found) | 1 |
| `lib/data/coach.ts:37` | `resolveScopingGymId` | (none found) | 1 |
| `lib/data/coach.ts:98` | `searchGymClients` | `coach/clients/page.tsx` | 1 |
| `lib/data/coach.ts:135` | `getMyClients` | `coach/classes/page.tsx`, `coach/clients/page.tsx`, `coach/library/page.tsx` | 1 |
| `lib/data/coach.ts:233` | `getClientHealthStatuses` | `coach/clients/page.tsx` | 2 |
| `lib/data/coach.ts:255` | `getClientLastActive` | `coach/clients/[clientId]/page.tsx` | 1 |
| `lib/data/coach.ts:269` | `getLatestWeighIn` | `coach/clients/[clientId]/page.tsx` | 1 |
| `lib/data/coach.ts:327` | `getRosterHabitAdherence` | (none found) | 3 |
| `lib/data/errors.ts:54` | `raise` | (none found) | 1 |
| `lib/data/foods.ts:50` | `findByBarcode` | (none found) | 1 |

