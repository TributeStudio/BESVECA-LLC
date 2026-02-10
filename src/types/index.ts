export type LogType = 'TIME' | 'EXPENSE' | 'STAY';

export interface Project {
  id: string;
  name: string;
  client: string;
  email?: string;
  phone?: string;
  address?: string;
  hourlyRate: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  createdAt: number;
}

export interface LogItem {
  id: string;
  projectId: string;
  client?: string; // Allow overriding client (Guest Name)
  date: string;
  description: string;
  type: LogType;
  // Time specific
  hours?: number;
  // Expense specific
  cost?: number;
  markupPercent?: number;
  // Stay specific
  checkIn?: string;
  checkOut?: string;
  cleaningFee?: number;
  cleaningCount?: number;
  poolHeat?: number;


  billableAmount?: number;
  profit?: number;
  createdAt: number;
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: 'admin' | 'user';
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  type: LogType;
  originalLogId?: string; // Reference to original log
  dates?: string; // e.g. "2023-10-01 - 2023-10-05" or just date
}

export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  method?: string;
  note?: string;
}

export interface InvoiceSchedule {
  id: string;
  label: string; // e.g. "Deposit", "Balance", "Installment 1"
  date: string;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // T-{CLIENT}-{YYMM}-{SEQ}
  clientId: string;
  date: string;
  dueDate: string;
  terms: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID';
  createdAt: number;
  payments?: InvoicePayment[];
  paymentSchedule?: InvoiceSchedule[];
}

export interface AppState {
  user: User | null;
  users: User[];
  projects: Project[];
  logs: LogItem[];
  invoices: Invoice[]; // New
  isDemoMode: boolean;
  isLoading: boolean;
}
