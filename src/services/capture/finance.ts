import { generateJson, type JsonSchema } from "../gemini.js"
import type { ISODate } from "../../lib/dates.js"

/**
 * Free text in, transactions out. Nothing is written and nothing is read:
 * everything this needs arrives in the request, because the categories are the
 * caller's own and the form that shows the result is theirs too.
 *
 * The caller checks the answer again before it renders — a row off a model is
 * untrusted whichever side of the wire it was asked for.
 */
export type CategoryOption = { name: string; kind: string; note?: string }

export type ParsedTransaction = {
  occurred_on?: string
  amount?: number
  kind?: string
  category?: string
  merchant?: string
  note?: string
}

/** The caller's form decides how many rows it can show; this is only a floor. */
const MAX_ITEMS = 40

const SYSTEM_PROMPT = `You extract personal spending records from a short note someone wrote about their own day. You work in Vietnamese and English.

Return one record per distinct payment or receipt. A sentence listing three purchases is three records. Never merge them, never invent one that is not mentioned, and never add a rounding, a tip or a tax the text does not state.

Amounts:
- Numbers are in the user's own currency, in major units. Keep decimals exactly as written — "4.50" is 4.5, not 4 — unless the currency has no minor unit, as VND does not. Vietnamese shorthand is common: "40k", "40 nghìn", "40 ngàn" are all 40000; "2tr", "2 triệu", "2 củ" are 2000000; "1 tỷ" is 1000000000.
- "50k mỗi người, 3 người" is one record of 150000 unless the text clearly separates the payments.
- If a price is genuinely absent, drop the record rather than guessing.

Dates: resolve every relative word against the note's date, given below. "sáng nay"/"trưa nay"/"tối nay"/"hôm nay" are that date; "hôm qua"/"tối qua" the day before; "hôm kia" two days before. With nothing stated, use the note's date. Never return a future date.

Kind: "expense" for money going out, "income" for money coming in (salary, refunds, gifts received). Default to "expense". Transfers between the user's own accounts are out of scope — record them as expense and let the user correct it.

Category: choose one name, copied exactly, from the list of the user's categories below. Some names include a short note after an em dash (—) that explains what belongs there — use that note to disambiguate, but still return only the category name itself, never the note, and never a name that is not on the list. Use "" when none of them fits.

Merchant: the shop, place or short label the text names ("phở Thìn", "Highlands", "ăn sáng"). Keep it under 60 characters and in the language the user wrote it. Use "" if there is nothing to name.

Note: only a detail the merchant field does not already carry. Usually "".`

const SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    transactions: {
      type: 'array',
      maxItems: MAX_ITEMS,
      items: {
        type: 'object',
        properties: {
          occurred_on: { type: 'string', format: 'date', description: 'YYYY-MM-DD' },
          amount: { type: 'number', description: 'Positive, in whole major currency units' },
          kind: { type: 'string', enum: ['expense', 'income'] },
          category: { type: 'string', description: 'Exactly one of the listed names, or ""' },
          merchant: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['occurred_on', 'amount', 'kind', 'category', 'merchant', 'note'],
      },
    },
  },
  required: ['transactions'],
}

function formatCategory(category: CategoryOption): string {
  const note = category.note?.trim()
  return note ? `${category.name} — ${note}` : category.name
}

export async function parseTransactions(input: {
  text: string
  today: ISODate
  currency: string
  categories: CategoryOption[]
  maxItems?: number
}): Promise<{ transactions: ParsedTransaction[]; model: string }> {
  const names = (kind: string) =>
    input.categories
      .filter((category) => category.kind === kind)
      .map(formatCategory)
      .join(" | ") || "(none)"

  const schema = {
    ...SCHEMA,
    properties: {
      transactions: {
        ...(SCHEMA.properties as Record<string, Record<string, unknown>>).transactions,
        maxItems: input.maxItems ?? MAX_ITEMS,
      },
    },
  }

  const { value, model } = await generateJson<{ transactions?: ParsedTransaction[] }>({
    systemInstruction: SYSTEM_PROMPT,
    schema,
    input: [
      `Note date: ${input.today}`,
      `Currency: ${input.currency}`,
      `Expense categories: ${names("expense")}`,
      `Income categories: ${names("income")}`,
      "",
      "Note:",
      input.text,
    ].join("\n"),
  })

  return { transactions: value.transactions ?? [], model }
}
