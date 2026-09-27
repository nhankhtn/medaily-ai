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
 *
 * **Keep it true.** A guide that describes last month's app is worse than no
 * guide: it is trusted the same and answers with facts that have moved. Where
 * a feature is half-built, say so here rather than leaving it out — someone
 * who has found the button deserves to know what it does and does not do.
 */
export type HelpTopic = {
  key: string
  /** As the sidebar names it, both languages. Empty for what is not a page. */
  page: string
  /** Its address, or how it is opened. */
  at: string
  body: string
  /**
   * One concrete moment someone reaches for this, and what they do.
   *
   * Describing a feature answers "what is it"; almost nobody asks that. They
   * ask "when would I use this", and a page described without an occasion is
   * exactly what leaves someone staring at a button they have found and still
   * cannot place. Empty only where a topic is not a feature to be used.
   */
  use: string
}

export const GUIDE: readonly HelpTopic[] = [
  {
    key: "overview",
    page: "",
    at: "",
    body: `medaily is a private tracker for one person. The daily log is its spine: most other pages either read from it or write back into it, so a day nobody logs is a gap everywhere. On a computer the pages are listed in the sidebar under Core, Life and Insight; on a phone the bottom bar holds Home, Finance, Daily Log and Timer, and everything else is behind More. Two things open from anywhere: quick capture (Ctrl/Cmd + J) and search (Ctrl/Cmd + K). Nothing here is required — the daily loop works on its own, and every other page is there when it earns its place.`,
    use: `Someone starting out should use two pages for a fortnight and ignore the rest: the daily log every evening, and the timer whenever they sit down to work. That alone fills the dashboard score, the habit ticks, the charts and the review numbers, because all of those are computed from those two. Adding finance, goals or projects before there are two weeks of days in the log means setting up pages that have nothing to read yet.`,
  },
  {
    key: "connections",
    page: "",
    at: "",
    body: `How the pages feed each other — the part that is not visible from any one screen. Two rules explain most of it. First, the daily log records the past and never holds intent; plans live in Calendar, in planned blocks and in tasks, so that "what I meant to do" and "what I did" stay comparable. Second, a fact is entered once. Concretely: a timed run becomes a focus session, which fills that day's study or deep-work minutes, adds to the time spent on its project, and fills the topic charts under Learning. Those same day numbers then tick any habit bound to them, feed any goal bound to them, and make up the dashboard score, the analytics charts and the numbers already computed on a review. A workout logged under Health fills the day's exercise minutes. A transaction that names someone from People becomes a debt. A note marked as a lesson is gathered by the review for its period. Nothing in this chain is typed twice, and nothing in it needs to be kept in step by hand.`,
    use: `This is the answer when someone asks why a number they never typed is on a page, or why one they did type was replaced. Example: they typed 30 minutes of study into the daily log, also timed a 90-minute learning run that day, and the day shows 90. Sessions win over the typed figure — see the daily log topic.`,
  },
  {
    key: "daily",
    page: "Daily Log / Ghi ngày",
    at: "/daily",
    body: `The form filled once a day, in three parts. Essentials: energy, mood, sleep hours. Activity, in minutes: technical study, deep work, exercise (with a type), reading (with pages), English, entertainment. Reflection: the day's win, the day's problem, tomorrow's priority, a note. Energy, sleep, technical study and deep work are the four that matter; the rest is optional. "Copy yesterday" fills the form from the day before and the copy can be edited before saving. An earlier day is opened at /daily/2026-09-01; a future day is refused, because plans belong in Calendar. Leaving a field empty means not recorded, never zero — a skipped day does not drag an average down. Study and deep work are counted separately: a stretch of time goes in one of them, not both. Unsaved typing is kept on that device until it is saved. The gear button at the top of the page opens two settings that used to live under Settings: which fields the form asks for, and the person's own activities.`,
    use: `The one thing worth knowing before typing anything into the study or deep-work boxes: if any focus session was timed that day, the total of those sessions REPLACES whatever is typed there — it is not added to it. So timing 90 minutes and also typing 30 gives 90 for the day, not 120. Type those two fields by hand only on days when the timer was not used at all; on days it was, the typed figure is ignored. The other minute fields — reading, English, entertainment — behave the opposite way: a timed run is added onto whatever is already there.`,
  },
  {
    key: "custom-metrics",
    page: "Your own activities / Hoạt động của bạn",
    at: "/daily",
    body: `The built-in fields are not the ceiling. The gear button at the top of the daily log opens a dialog whose first half is "your own activities". A new one takes a name in both languages — the key fills itself from the English name and stays editable — a kind, and a unit if it helps. The kinds are number, minutes, scale 1 to 10, yes/no, and text. It then appears on the daily log under "Your own", and a habit or a goal can bind to it exactly like a built-in metric; a text one cannot be bound to, because there is no number to compare. Removing one hides it from the form and leaves the days already logged untouched.`,
    use: `Minutes is the kind that earns more than an input box: an activity measured in minutes is offered by the timer alongside the built-in ones, so something invented — guitar practice, say — can be timed, and the minutes land on that day's value for it. The usual sequence is: add the activity as minutes, time it from the Timer page, then bind a habit to it at whatever daily threshold is wanted. Yes/no is the kind to reach for when the thing is a judgement rather than a measurement — "went to bed on time" — since there is nothing to count.`,
  },
  {
    key: "home",
    page: "Home / Trang chính",
    at: "/",
    body: `The dashboard, and where the day's score is. The score is built from six components — focus (study and deep work together), sleep, exercise, habits, reading, and keeping entertainment down — each measured against the targets in Settings and weighted by the weights there. Only components that have data count, so leaving a field empty lowers nothing; it takes that component out of the sum instead. Clicking the score opens the breakdown, one row per component, with the input and the points it contributed. Beside it: yesterday, the current streaks, and trends once there are a few days to draw one from. When today is still blank it offers a two-tap quick log — energy and sleep.`,
    use: `When a score looks wrong, open the breakdown before changing anything: it usually shows a component with no data rather than a bad one. Someone who never reads and does not want reading counted should set its weight to zero in Settings rather than logging a zero, since a logged zero scores zero while an empty field is left out of the sum entirely.`,
  },
  {
    key: "habits",
    page: "Habits / Thói quen",
    at: "/habits",
    body: `Habits are ticked daily, and the grid shows the month. A habit repeats every day, a number of times a week, on chosen weekdays, or every N days. The part worth using is binding it to a number already being logged — sleep at least 7 hours, study at least 30 minutes — so it ticks itself off the daily log instead of being entered twice, including for days logged before the habit existed. A derived tick disappears again if the underlying number changes, so the two can never disagree. What can be bound to: energy, mood, sleep hours, study minutes, deep work minutes, focus minutes (study and deep work added together), exercise minutes, reading minutes, reading pages, entertainment minutes, English minutes, and any of the person's own metrics that is not text. Bedtime and wake time cannot be bound to; the app has nowhere to enter them. With the grace day on, one missed day inside a week pauses a streak rather than ending it. Archiving keeps the history and stops the habit appearing.`,
    use: `A sleep routine is the common case and the one that needs care. "Sleep at least 7 hours" works today: bind a daily habit to sleep hours with a floor of 7, log sleep hours each morning, and it ticks itself. "In bed by 22:30" does not work — there is no bedtime field to enter and nothing to bind to. The way round it is a yes/no activity of their own called something like "went to bed on time", added from the gear on the daily log, with a daily habit bound to it; they answer it each morning and the streak is then real.`,
  },
  {
    key: "goals",
    page: "Goals / Mục tiêu",
    at: "/goals",
    body: `A goal measures its progress in one of three ways: a percentage set by hand, a number already being logged, or milestones ticked off. The second is the one that fills its own bar — pick the metric, how to combine it (total, average, days with any value, latest value), over the whole goal or each week or each month, and whether the target is a floor or a ceiling. With a deadline, the goal also says whether it is ahead, on track or behind, and what rate per day would finish it on time. Milestones are weighted, so a heavier step moves the bar further. A project can be attached to a goal, which is how work connects to intent. The handle on the left of a row reorders the list, by dragging or with the arrow keys, and the order follows to another device.`,
    use: `Pick the shape from whether a number already exists. "300 study minutes a week" is a metric goal — total, weekly, floor of 300 — and never needs touching again. "Ship the app" is milestones, because nothing being logged measures it. Manual is the last resort, for a goal whose progress only the person can judge. A ceiling is the one people forget: "under 10 hours of entertainment a month" is the same machinery with the target the other way round.`,
  },
  {
    key: "timer",
    page: "Timer / Bấm giờ",
    at: "/timer",
    body: `Times a stretch of work, counting up or down. Pick the activity, press start; the space bar starts and pauses it too. The built-in activities are learning, deep work, project, English, reading, exercise and entertainment, and any of the person's own activities measured in minutes is offered beside them. Learning, deep work and project runs also take a topic and a project. What matters is where the minutes go when it stops, which is decided by the activity and never asked: learning, deep work and project runs are filed as focus sessions; exercise becomes a workout under Health, whose minutes fill the day's exercise minutes; English, reading and entertainment are added onto that day's figure for them; one of the person's own minute activities is added onto that day's value for it. A run under 30 seconds records nothing. A run left going is capped at 8 hours. Starting a new run files whatever was still running before it, so a forgotten session is saved rather than lost. The badge in the header follows to other pages and the tab title carries the clock.`,
    use: `The timer is how the study and deep-work figures are meant to be filled — typing them is the fallback for a day it was not used. Someone who sits down for a focused stretch picks deep work, names the project if it belongs to one, and presses start; at the end the day's deep-work minutes, the project's time spent and the week's actual hours on the calendar are all filled by that one stop, with nothing typed anywhere.`,
  },
  {
    key: "blocks",
    page: "Planned blocks / Khối thời gian",
    at: "/calendar",
    body: `A block is one line of intent: on this date, from this time to this time, a stretch of a kind of work. The kinds are deep work, learning, project, exercise and other. It is created from "Plan a block" on the Calendar, on the Day view or the Week view, and it carries an optional note. Three limits decide whether it is the right tool. A block does not repeat — there is no recurrence, so anything regular means creating one row per day by hand. The comparison it feeds lives only on the Week view, not the Day view: a row per day with a planned bar and an actual bar, and totals above them. And "actual" counts focus sessions only, so a block of exercise or of "other" can never be matched by anything and will sit at zero. The comparison is also per day rather than per block: planning 8 to 10 in the morning and working the same hours at 3pm still counts in full, because only the day's totals are compared. A block also has a project field, which is stored and then never read back — choosing one changes nothing on any screen today.`,
    use: `It is for budgeting focused hours a week ahead and finding out on the Friday how much of that budget was fiction. The workflow is: on Sunday, open Calendar on the Week view and create the blocks for the week — two hours of deep work on Monday, Wednesday and Friday mornings, say. During the week, use the timer whenever work actually happens. On Friday, the Week view shows planned 8.5 hours against actual 5, and 59%. That percentage is the whole point of the feature; without it there is no way to tell whether five hours was a good week. Anyone who does not plan weeks this way can ignore blocks entirely — nothing else in the app reads them. And for anything regular — sleep, a daily gym slot — the answer is a habit, not a block, because blocks do not repeat. For an appointment at a fixed time, the answer is an event, which does repeat.`,
  },
  {
    key: "calendar",
    page: "Calendar / Lịch",
    at: "/calendar",
    body: `Day, week, month and year views over the same date. The Day view is the working one: a to-do box that files a task due the day being looked at, the events of the day, the blocks planned for it, reminders that have come due, and the priority written on yesterday's log. "Plan tomorrow" moves the date so anything added is due then; "Back to today" returns. A backlog card holds tasks nobody has given a date, and the calendar icon beside one puts it on the day being viewed. Events are things that happen at a time: a title, a date, start and end times or all-day, an optional note, and a repeat — daily, weekly, monthly, quarterly or yearly, with or without an end date. Editing a repeating event changes every occurrence of it. A repeat refuses to slide a date into a month that lacks it, so a 31st skips short months and 29 February returns only in leap years. The Week view adds the planned-against-actual comparison. Everything exports one-way as .ics, so it stays readable in any calendar app.`,
    use: `The three things on the Day view are easy to confuse, and the choice is about what is wanted rather than about time. Something happening at a fixed time with other people — a meeting at 3pm — is an event, and events are the only one of the three that repeats. Something that has to get finished is a task on the to-do card. A stretch of time set aside for focused work is a block. Anything regular that is about the person's own routine is none of the three; it is a habit.`,
  },
  {
    key: "learning",
    page: "Learning / Học tập",
    at: "/learning",
    body: `Two tabs. Sessions holds the timed study and deep-work runs with their topic and project, the topics themselves, and the books and courses being worked through with a status and progress. A topic groups the hours put into one area — Postgres, English, system design — and picking one when a run starts is what fills the charts; "Manage" on the time-by-topic card is where topics are added, renamed or put away, and putting one away hides it from the pickers while leaving the sessions filed under it alone. Notes is the writing tab, in Markdown. Writing [[the title of another note]] links both ways: the body renders it as a real link, and the other note lists this one under "Linked from". A link to a note that does not exist yet is kept rather than dropped and starts working the day that note is created. A note can be filed under a topic and against a book or course. A note typed as a lesson carries the day it was learned rather than the day it was typed, and its place is a tag — #office, #home — which is what the review groups lessons by. Pictures can be pasted straight into a note when Cloudinary is configured.`,
    use: `Topics are worth setting up before timing much, because a session filed without one cannot be sorted into the charts afterwards from the Timer page. Someone learning two things at once adds both as topics, then picks one each time they start a run; the time-by-topic chart then answers "where did the hours actually go" at the end of the month without anything being added up by hand.`,
  },
  {
    key: "projects",
    page: "Projects / Dự án",
    at: "/projects",
    body: `A project is tasks and hours behind a goal. Tasks are added by typing one and pressing Enter, and carry a status, a priority, a due date and an estimate; a task can hold sub-tasks, one level deep. A task with a due date also appears on the Calendar's day view for that day. Time spent is never typed: it is summed from the focus sessions filed to the project, so it cannot drift from reality. A project can be attached to a goal.`,
    use: `The way to fill a project's hours is to name the project on the timer before starting a run — there is no field to type them into, by design. Someone wondering why a project shows zero hours after a week of work on it has been timing runs without naming the project, or not using the timer at all.`,
  },
  {
    key: "finance",
    page: "Finance / Tài chính",
    at: "/finance",
    body: `An account comes first — a bank, an e-wallet, cash, a credit card, an investment account, or a loan — because a transaction needs somewhere to sit. A debt owed is entered as a negative opening balance. A transaction is income, an expense, or a transfer; a transfer moves money between two of the person's own accounts as a single row and is counted as neither income nor spending. Amounts format as they are typed: 100000 becomes 100.000. Categories group expenses, and a budget is a monthly limit per category, which is why the category has to exist first. Adding a transaction works without a connection the way the daily log does, and one held on the device is shown above the ledger as waiting; editing and deleting still need a connection. The ledger is ordered newest first by the date the money moved, then by when the row was created. The Report tab reports a month or a year, with the period in the address so it can be linked to. Assets, liabilities and holdings are here too, and holdings are priced by hand — there is no market data feed.`,
    use: `The fastest way to enter a day of spending is quick capture with the Finance destination: write it the way it would be said — "bánh mì 30k sáng nay, cà phê 25k, cơm trưa 55k" — and check the rows before saving. For a monthly limit, the order is category first, then budget, then the transactions get filed against it as they are added. A transfer is the right row for moving money to a savings account; entering it as an expense and an income instead makes the month look like both more spending and more earning than happened.`,
  },
  {
    key: "debts",
    page: "Debts / Nợ",
    at: "/finance",
    body: `A transaction can name someone from the contact book, and naming them is what makes it a debt. Which way it counts follows from the transaction itself: money going out is lending or paying someone back, money coming in is them repaying or the person borrowing. Those add up to one number per person — above zero they owe, below zero they are owed — shown in a card on the Finance overview. Nothing is ever marked settled, because settling a debt is recording the repayment. Debts are left out of the income and expense totals and out of the report: money lent is not money spent. The account balance still drops, because the money did leave; net worth does not, because it is still owed. A transfer cannot be a debt, since both accounts already belong to the person, and the field is not offered on one.`,
    use: `Lending a friend 500k: record it as an expense from the account it left, and name them on the transaction. When they pay it back, record income to the account it landed in and name them again — the two cancel and the balance for that person returns to zero. There is no tick box to look for, and a debt cannot go stale behind one someone forgot to press.`,
  },
  {
    key: "health",
    page: "Health / Sức khỏe",
    at: "/health",
    body: `Workouts, body measurements and nutrition. A workout carries its type, duration, distance, calories, effort (RPE) and its exercises with sets and reps — the sets live here, and the daily log only wants the minutes, which are filled from the workout automatically. Measurements are weight (drawn with a 7-day average), body fat, waist and resting heart rate. Nutrition is protein, carbs, fat and water for a day.`,
    use: `A workout timed from the Timer page lands here as a workout and fills the day's exercise minutes at the same time; the sets and reps are then added to that workout here if they are wanted. Entering the same session in both places would double-count it, so the rule is one of the two — time it, or write it up here.`,
  },
  {
    key: "journal",
    page: "Journal / Nhật ký",
    at: "/journal",
    body: `Longer writing — what does not fit on one line of the daily log. An entry has a date, a mood, tags, and a body written in Markdown with a preview beside it. Entries are searchable from Ctrl/Cmd + K along with everything else.`,
    use: `The daily log's "win" and "problem" are one line each and are pulled into reviews; the journal is for the day that needs paragraphs. A common split is to keep the one-liners in the log so the review has something to seed from, and write the long version here when there is one.`,
  },
  {
    key: "people",
    page: "People / Quan hệ",
    at: "/people",
    body: `People worth keeping up with. Each has a relationship, contact details, a birthday, notes in Markdown, and a cadence — stay in touch every N days — which is what makes the page useful: it says who is overdue and by how long. Interactions are logged with a channel (in person, call, message, email) and a line about what it was about. Birthdays in the next 30 days are listed, and reminders live here too. With Cloudinary configured each person has a photo gallery. A person named on a transaction is what creates a debt.`,
    use: `The cadence is the reason to bother filling this in: setting 30 days on a handful of people turns the page into a list of who has quietly gone six weeks without a word, which is the thing nobody notices on their own. Logging an interaction is what resets that clock, so the one habit that makes it work is adding a line after a call rather than trying to remember later.`,
  },
  {
    key: "career",
    page: "Career / Sự nghiệp",
    at: "/career",
    body: `Skills with a level out of 5 and the level being aimed at, so the gap is visible; achievements with a date, the impact they had and a link; and portfolio items with their tech, a description and a link.`,
    use: `It is a slow page — filled a few times a year rather than daily. The occasion it is for is writing a CV or going into a review with something better than memory: an achievement written down on the week it happened, with its impact, is worth more than the same thing reconstructed a year later.`,
  },
  {
    key: "analytics",
    page: "Analytics / Thống kê",
    at: "/analytics",
    body: `Trends over 7, 30, 90 or 365 days, where the time went, and comparisons between two things that were logged — sleep against energy, sleep against focus time. A comparison is only shown when it can mean something: at least 21 days with both values recorded, at least 7 days on each side of the split, and a difference larger than ordinary variation. When it is not shown, the page says which of those failed. What it reports is that two things were recorded on the same days, never that one caused the other.`,
    use: `There is nothing to do on this page except read it, and nothing to read until there are about three weeks of days in the log. Someone opening it in their first fortnight and finding it empty has not set anything up wrong — the thresholds exist so that three days of data cannot be dressed up as a pattern.`,
  },
  {
    key: "reviews",
    page: "Reviews / Tổng kết",
    at: "/reviews",
    body: `Weekly, monthly and yearly write-ups. The numbers for the period are computed already — days logged, average energy and sleep, study and deep work totals, exercise days, habit completion, the period score, the best and hardest day — and the lessons written in notes for that period are gathered here, grouped by their place tag. What is written by hand is what worked, what did not, what should change, and one priority for the next period, which the next review asks about. The wins and problems written in the daily log can be pulled into the text with "seed" rather than remembered. Finalising freezes the numbers as they stood, so the review still shows what it showed then; a draft recomputes every time it is opened. With an AI service configured, a narrative can be generated for a week or a month from the aggregate numbers only.`,
    use: `The useful order is: open the week, read the numbers first, press seed to pull in the wins and problems already written, then write the four answers against what is on the screen rather than against memory. Finalise once it is written — a draft that is left open keeps recomputing, so a week reopened in December would show numbers that have since changed.`,
  },
  {
    key: "capture",
    page: "Quick capture / Ghi nhanh",
    at: "Ctrl/Cmd + J, from any page",
    body: `One box that files things without opening the page they belong to. Typing / chooses where it goes: Finance, Goals & to-dos, Looking back, or the Assistant. Those are destinations inside the box, not the pages of the same name. For Finance and for Goals & to-dos the text is written the way it would be said and comes back as rows that can be edited, retyped or unticked; nothing is saved until the button is pressed. A row can also be switched between goal and to-do, which is the call the split gets wrong most often. Only the typed text leaves the machine — not existing goals, not tasks, not any logged number. The Assistant destination is this conversation. Capture needs a connection, because it asks a model to read the sentence.`,
    use: `Goals and to-dos is for a paragraph of intentions typed in one go after a planning session — it splits them into goals to pursue and tasks to tick off. The rule it follows is that a to-do is finished once and ticked off while a goal is pursued over time, and where it could honestly be either it comes back as a to-do, because a to-do is one line to delete and a goal is a record to unpick.`,
  },
  {
    key: "search",
    page: "Search / Tìm kiếm",
    at: "Ctrl/Cmd + K, from any page",
    body: `Searches notes, journal entries, daily logs, tasks, projects, goals and people at once, ignoring accents, and doubles as the way to jump to a page. It also takes commands: "sleep 7.5" or "study 45" records that number for today without leaving the page, and a date like "2026-09-01" opens that day's log.`,
    use: `The quickest way to log one number is here rather than on the daily log: Ctrl/Cmd + K, type "sleep 7.5", Enter, and the box closes without the page changing. Worth knowing for the morning, when sleep is the only field being filled.`,
  },
  {
    key: "settings",
    page: "Settings / Cài đặt",
    at: "/settings",
    body: `Language (English or Vietnamese, applied immediately), appearance, time zone, the hour a day rolls over — anything logged before it counts as the previous day — which day a week starts on, whether streaks get a grace day, the targets each score component is measured against, and the weights behind the score, which must add up to 100%. Keyboard shortcuts are listed and can be rebound by clicking a key and pressing the new one; two-key sequences work, conflicts are refused, and shortcuts are ignored while the cursor is in a text box. Everything exports as JSON, or one module as CSV, and an export imports back with a dry run that says what would be created before anything is written. Which fields the daily log asks for, and the person's own activities, are no longer here — both moved to the gear button at the top of the daily log.`,
    use: `The rollover hour is the setting worth changing first for anyone who logs after midnight: set it to 3am and a day written at 1am still counts as the day that just ended, rather than starting the next one with yesterday's numbers.`,
  },
  {
    key: "offline",
    page: "",
    at: "",
    body: `Two pages work without a connection, and only after each has been opened once online, since what is kept is the last copy the server sent. The daily log can be filled and saved: the save is held on the device, the toast says so rather than claiming it went up, and it is sent on its own the next time there is a connection. Finance can add a transaction the same way, and a waiting one is shown above the ledger; editing and deleting a transaction still need a connection. Sending the same day or the same transaction twice is harmless — the day replaces its row, and a transaction carries an id decided by the browser before the first attempt. Signing out deletes everything the device is holding: the cached pages, anything still waiting to be sent, and unsaved drafts.`,
    use: `This is the answer for someone who filled the log on a metro and is asking whether it was lost. It was not, as long as they have not signed out — a sign-out with days still waiting does lose them, so the advice is to get a connection before signing out.`,
  },
]
