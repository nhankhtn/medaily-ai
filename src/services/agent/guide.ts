/**
 * The manual, as data. "Làm sao để ghi một khoản chi?" is a question about the
 * app, not about the person, and it has a right answer — one the model must not
 * be left to invent. Everything here was read off the app's own screens.
 *
 * Written in English and answered in whatever language was asked: the responder
 * translates, and the page names carry their Vietnamese label so an answer can
 * point at the words in the sidebar rather than a translation of them.
 *
 * It is sent whole. Picking a few topics by keyword would be smaller and would
 * also be the thing that answers "how do I make a goal" without the goals
 * topic in front of it; at this size, being complete is worth more than being
 * short. If it grows past what a prompt should carry, select here — not in the
 * node, which has no business knowing how the guide is stored.
 */
export type HelpTopic = {
  key: string
  /** As the sidebar names it, both languages. Empty for what is not a page. */
  page: string
  /** Its address, or how it is opened. */
  at: string
  body: string
}

export const GUIDE: readonly HelpTopic[] = [
  {
    key: "overview",
    page: "",
    at: "",
    body: `medaily is a private tracker for one person. The daily log is its spine: most other pages either read from it or write back into it, so a day nobody logs is a gap everywhere. On a computer the pages are listed in the sidebar under Core, Life and Insight; on a phone the bottom bar holds Home, Daily Log, Habits and Goals, and the rest is behind More. Two things open from anywhere: quick capture (Ctrl/Cmd + J) and search (Ctrl/Cmd + K).`,
  },
  {
    key: "daily",
    page: "Daily Log / Ghi ngày",
    at: "/daily",
    body: `The form filled once a day, in three sections. Essentials: energy, mood, sleep hours, bedtime, wake time. Activity, in minutes: technical study, deep work, exercise (with a type), reading (with pages), English, entertainment. Reflection: the day's win, the day's problem, tomorrow's priority, a note. Energy, sleep, technical study and deep work are the four that matter; the rest is optional. "Copy yesterday" fills the form from the day before, and the copy can be edited before it is saved. An earlier day is opened at /daily/2026-09-01 or with the previous-day shortcut; a future day is refused, because plans belong in Calendar. Study and deep work are counted separately — a block of time goes in one of them, not both. If focus sessions were timed that day, their minutes fill the field and can still be overridden by hand. Unsaved typing is kept on that device until it is saved. Fields that are never used can be turned off in Settings.`,
  },
  {
    key: "home",
    page: "Home / Trang chính",
    at: "/",
    body: `The dashboard, and where the day's score is. The score is built from six components — focus, sleep, exercise, habits, reading, and keeping entertainment down — each measured against the targets in Settings and weighted by the weights there. Only components that have data count, so leaving a field empty lowers nothing; it just takes that component out of the sum. Clicking the score opens the breakdown, one row per component, with the input and the points it contributed. Beside it: yesterday, the current streaks, and trends once there are a few days to draw one from.`,
  },
  {
    key: "habits",
    page: "Habits / Thói quen",
    at: "/habits",
    body: `Habits are ticked daily, and the grid shows the month. A habit repeats every day, a number of times a week, on chosen weekdays, or every N days. The part worth using is "tick it automatically": tie the habit to a number already being logged — sleep at least 7 hours, study at least 30 minutes — and it ticks itself off the daily log instead of being entered twice, including for days already logged before the habit existed. With the grace day on, one missed day inside a week pauses a streak rather than ending it. Archiving keeps the history and stops the habit appearing.`,
  },
  {
    key: "goals",
    page: "Goals / Mục tiêu",
    at: "/goals",
    body: `A goal measures its progress in one of three ways: a percentage set by hand, a number already being logged, or milestones ticked off. The second is the one that fills its own bar — pick the metric, how to combine it (total, average, days with any value, latest value), over the whole goal or each week or each month, and whether the target is a floor or a ceiling. With a deadline, the goal also says whether it is ahead, on track or behind, and what rate per day would finish it on time. The handle on the left of a row reorders the list, by dragging or with the arrow keys.`,
  },
  {
    key: "timer",
    page: "Timer / Bấm giờ",
    at: "/timer",
    body: `Times a stretch of work, counting up or down. Pick the activity — learning, deep work, a project, English, reading, exercise, entertainment — and press start; the space bar starts and pauses it too. What matters is where the minutes go when it stops: learning, deep work and project runs are filed as focus sessions under Learning, exercise becomes a workout under Health, and the rest is added to that day's log. Nothing is entered a second time. A run under 30 seconds records nothing, and one left running is capped at 8 hours.`,
  },
  {
    key: "learning",
    page: "Learning / Học tập",
    at: "/learning",
    body: `Two tabs. Sessions holds the timed study and deep-work runs with their topic and project, the topics themselves, and the books and courses being worked through. Sessions replace the minutes typed into the daily log for the same day. A topic groups the hours put into one area — Postgres, English, system design — and picking one when a run starts is what fills the charts. Notes is the writing tab: a note typed with [[the title of another note]] links both ways, and the other note lists this one under "Linked from".`,
  },
  {
    key: "projects",
    page: "Projects / Dự án",
    at: "/projects",
    body: `A project is tasks and hours behind a goal. Tasks are added by typing one and pressing Enter, and carry a status, a priority, a due date and an estimate. Time spent is not entered: it is summed from the focus sessions filed to the project, so the way to fill it is to start the timer on the project.`,
  },
  {
    key: "finance",
    page: "Finance / Tài chính",
    at: "/finance",
    body: `An account comes first — BIDV, Vietcombank, VIB, another bank, Momo, another e-wallet, cash, a credit card, an investment account, or a loan — because a transaction needs somewhere to sit. A debt is entered as a negative opening balance. A transaction is income, an expense, or a transfer; a transfer moves money between two of the person's own accounts as a single row, so it is never counted as income or as spending. Categories group expenses, and a budget is set per category per month, which is why a category has to exist first. The Report tab reports a month or a year. Assets, liabilities and holdings are also here, and holdings are priced by hand — there is no market data feed. The quickest way to enter a day of spending is quick capture with the Finance destination: write it the way it would be said, then check the rows before saving.`,
  },
  {
    key: "health",
    page: "Health / Sức khỏe",
    at: "/health",
    body: `Workouts, body measurements and nutrition. A workout carries its type, duration, distance, calories, effort (RPE) and its exercises with sets and reps — the sets live here, and the daily log only wants the minutes, which are copied into it automatically. Measurements are weight (drawn with a 7-day average), body fat, waist and resting heart rate. Nutrition is protein, carbs, fat and water for a day.`,
  },
  {
    key: "journal",
    page: "Journal / Nhật ký",
    at: "/journal",
    body: `Longer writing — what does not fit on one line of the daily log. An entry has a date, a mood, tags, and a body written in Markdown with a preview beside it.`,
  },
  {
    key: "calendar",
    page: "Calendar / Lịch",
    at: "/calendar",
    body: `Day, week, month and year views. Events can repeat daily, weekly, monthly, quarterly or yearly, with or without an end date; editing a repeating event changes every occurrence of it. Planned blocks are stretches of learning or deep work set aside in advance — this is where a plan for a future day goes, since the daily log only accepts days that have happened.`,
  },
  {
    key: "people",
    page: "People / Quan hệ",
    at: "/people",
    body: `People worth keeping up with. Each has a relationship, contact details, a birthday, notes in Markdown, and a cadence — stay in touch every N days — which is what makes the page useful: it says who is overdue and by how long. Interactions are logged with a channel (in person, call, message, email) and a line about what it was about, and birthdays in the next 30 days are listed. Reminders live here too.`,
  },
  {
    key: "career",
    page: "Career / Sự nghiệp",
    at: "/career",
    body: `Skills with a level out of 5 and the level being aimed at, so the gap is visible; achievements with a date and the impact they had; and portfolio items with their tech and a link.`,
  },
  {
    key: "analytics",
    page: "Analytics / Thống kê",
    at: "/analytics",
    body: `Trends over 7, 30, 90 or 365 days, where the time went, and comparisons between two things that were logged — sleep against energy, sleep against focus time. A comparison is only shown when it can mean something: at least 21 days with both values recorded, at least 7 days on each side of the split, and a difference larger than ordinary variation. When it is not shown, the page says which of those failed. What it reports is that two things were recorded on the same days, never that one caused the other.`,
  },
  {
    key: "reviews",
    page: "Reviews / Tổng kết",
    at: "/reviews",
    body: `Weekly, monthly and yearly write-ups. The numbers for the period are computed already — days logged, average energy and sleep, study and deep work totals, exercise days, habit completion, the period score, the best and hardest day. What is written by hand is what worked, what did not, what should change, and one priority for the next period, which the next review asks about. The wins and problems written in the daily log are offered as a starting point. Finalizing freezes the numbers as they stood; reopening unfreezes them, and they can be recomputed.`,
  },
  {
    key: "capture",
    page: "Quick capture / Ghi nhanh",
    at: "Ctrl/Cmd + J, from any page",
    body: `One box that files things without opening the page they belong to. Typing / chooses where it goes: Finance, Goals & to-dos, Looking back, or the Assistant. Those are destinations inside the box, not the pages of the same name. For Finance and for Goals & to-dos the text is written the way it would be said — "bánh mì 30k sáng nay, cà phê 25k" — and comes back as rows that can be edited or unticked; nothing is saved until the button is pressed. The Assistant destination is this conversation.`,
  },
  {
    key: "search",
    page: "Search / Tìm kiếm",
    at: "Ctrl/Cmd + K, from any page",
    body: `Searches notes, journal entries, daily logs, tasks, projects, goals and people at once, and doubles as the way to jump to a page. It also takes commands: "sleep 7.5" or "study 45" records that number for today without leaving the page, and a date like "2026-09-01" opens that day's log.`,
  },
  {
    key: "settings",
    page: "Settings / Cài đặt",
    at: "/settings",
    body: `Language (English or Vietnamese, applied immediately), appearance, time zone, the hour a day rolls over — anything logged before it counts as the previous day — which day a week starts on, whether streaks get a grace day, and the weights behind the score, which must add up to 100%. "What the day log asks" turns off fields that are never used: the data already recorded stays, and a day that has a value still shows that field. Keyboard shortcuts are listed and can be rebound, and they are ignored while the cursor is in a text box. Everything can be exported as JSON, or the daily logs alone as CSV, and an export imports back into a clean install.`,
  },
  {
    key: "offline",
    page: "",
    at: "",
    body: `The daily log is the one page that still opens without a connection, and only after it has been opened once online — what is kept is the last copy the server sent. Nothing else is stored on the device, and that copy is deleted on sign-out.`,
  },
]
