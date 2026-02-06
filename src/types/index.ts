export type LogType = 'TIME' | 'EXPENSE';

export interface Project {
  id: string;
  name: string;
  client: string;
  hourlyRate: number;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
  createdAt: number;
}

export interface LogItem {
  id: string;
  projectId: string;
  date: string;
  description: string;
  type: LogType;
  // Time specific
  hours?: number;
  // Expense specific
  cost?: number;
  markupPercent?: number;
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
  type: 'TIME' | 'EXPENSE';
  originalLogId?: string; // Reference to original log
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
  status: 'DRAFT' | 'SENT' | 'PAID';
  createdAt: number;
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
