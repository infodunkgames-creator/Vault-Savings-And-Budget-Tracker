// Shapes returned by GET /api/state. Money is always integer cents.
export type Cents = number;
export type ISODate = string; // YYYY-MM-DD
export type Month = string; // YYYY-MM
export type Frequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly' | 'once';
export type TxType = 'income' | 'expense';

export interface Category {
  id: number; name: string; kind: TxType; color: string; icon: string; budget: Cents; is_default: number; sort: number;
}
export interface BudgetOverride { id: number; category_id: number; month: Month; amount: Cents; note: string | null }
export interface Account {
  id: number; name: string; kind: 'asset' | 'liability'; type: string; balance: Cents; verified: number;
  include_in_available: number; source: string; notes: string | null; is_demo: number; updated_at: string;
}
export interface IncomeSource {
  id: number; name: string; type: string; expected_amount: Cents; frequency: Frequency; anchor_date: ISODate;
  account_id: number | null; active: number; notes: string | null; is_demo: number;
}
export interface Transaction {
  id: number; description: string; amount: Cents; type: TxType; category_id: number | null; account_id: number | null;
  income_source_id: number | null; date: ISODate; time: string | null; notes: string | null; recurring: Frequency | null;
  import_hash: string | null; is_demo: number; created_at: string;
}
export interface Bill {
  id: number; name: string; amount: Cents; category_id: number | null; account_id: number | null; frequency: Frequency;
  anchor_date: ISODate; active: number; notes: string | null; is_demo: number; created_at: string;
}
export interface BillPayment { id: number; bill_id: number; due_date: ISODate; paid_date: ISODate; amount: Cents; transaction_id: number | null }
export interface Goal {
  id: number; name: string; emoji: string; color: string; target: Cents; target_date: ISODate | null; description: string | null;
  monthly_contribution: Cents; archived: number; is_demo: number; created_at: string;
}
export interface GoalContribution { id: number; goal_id: number; amount: Cents; date: ISODate; note: string | null; account_id: number | null; is_demo: number }
export interface Debt {
  id: number; name: string; type: string; original_balance: Cents; current_balance: Cents; apr: number; min_payment: Cents;
  due_day: number; notes: string | null; is_demo: number;
}
export interface DebtPayment { id: number; debt_id: number; amount: Cents; date: ISODate; note: string | null; transaction_id: number | null }
export interface NetWorthSnapshot { id: number; month: Month; assets: Cents; liabilities: Cents; is_demo: number }

export interface NotificationPrefs {
  bills: boolean; billLeadDays: number; budgetWarning: boolean; budgetThreshold: number; budgetOver: boolean;
  goalMilestones: boolean; monthlySummary: boolean;
}
export interface Settings {
  profile: { name: string; email: string };
  preferences: { currency: string; locale: string; weekStartsOn: number; dashboardRange: RangeKey };
  notifications: NotificationPrefs;
  meta: { onboarded?: boolean; demoLoadedAt?: string; demoBannerHidden?: boolean };
}

export interface AppState {
  today: ISODate;
  hasDemo: boolean;
  settings: Settings;
  categories: Category[];
  budgetOverrides: BudgetOverride[];
  accounts: Account[];
  incomeSources: IncomeSource[];
  transactions: Transaction[];
  bills: Bill[];
  billPayments: BillPayment[];
  goals: Goal[];
  goalContributions: GoalContribution[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  netWorthSnapshots: NetWorthSnapshot[];
  dismissedNotifications: string[];
}

export type RangeKey = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
