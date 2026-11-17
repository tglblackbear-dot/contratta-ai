export type ContractStatus =
  | "draft"
  | "in_progress"
  | "awaiting_signature"
  | "completed"
  | "cancelled";

export interface Contract {
  id: string;
  owner_id: string;
  template_id: string | null;
  title: string;
  contract_type: string;
  status: ContractStatus;
  interview_data: Record<string, unknown>;
  content: string | null;
  created_at: string;
  updated_at: string;
}

export interface FrequentParty {
  id: string;
  owner_id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface ContractTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  version: number;
  fields: Array<{ key: string; label: string; required: boolean }>;
  clauses: Array<{ title: string; body: string }>;
  updated_at: string;
}

export interface InterviewMessage {
  id: string;
  session_id: string;
  client_operation_id?: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface InterviewSession {
  id: string;
  contract_id: string;
  state: string;
  fields: Record<string, unknown>;
  missing_fields: string[];
  progress: number;
  version: number;
}

export interface OfflineInterviewOperation {
  id: string;
  session_id: string;
  message: string;
  expected_version: number;
  created_at: string;
  status: "queued" | "conflict";
}

export interface OfflineInterviewSnapshot {
  session: InterviewSession;
  contract: Pick<Contract, "id" | "title" | "template_id">;
  template: ContractTemplate;
  messages: InterviewMessage[];
  outbox: OfflineInterviewOperation[];
  cached_at: string;
}
