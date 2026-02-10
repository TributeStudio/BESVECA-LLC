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
