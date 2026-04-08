
export interface Contact {
  id: string;
  name: string;
  email: string;
}

export interface ChildModeConfig {
  enabled: boolean;
  username: string;
  password: string;
  trackingActive: boolean;
}

const CONTACTS_KEY = 'emergency_contacts_v2';
const CALL_911_KEY = 'call_911_enabled';
const EMAIL_ENABLED_KEY = 'email_enabled';
const MESSAGE_TEMPLATE_KEY = 'message_template_v2';
const USER_NAME_KEY = 'user_full_name';
const CHILD_MODE_KEY = 'child_mode_config_v1';

export function getContacts(): Contact[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(CONTACTS_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function saveContacts(contacts: Contact[]): void {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

export function addContact(name: string, email: string): void {
  const contacts = getContacts();
  contacts.push({ id: Math.random().toString(36).substr(2, 9), name, email });
  saveContacts(contacts);
}

export function removeContact(id: string): void {
  const contacts = getContacts();
  saveContacts(contacts.filter(c => c.id !== id));
}

export function getCall911Enabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(CALL_911_KEY);
  return stored === null ? true : JSON.parse(stored);
}

export function setCall911Enabled(enabled: boolean): void {
  localStorage.setItem(CALL_911_KEY, JSON.stringify(enabled));
}

export function getEmailEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(EMAIL_ENABLED_KEY);
  return stored === null ? true : JSON.parse(stored);
}

export function setEmailEnabled(enabled: boolean): void {
  localStorage.setItem(EMAIL_ENABLED_KEY, JSON.stringify(enabled));
}

export function getMessageTemplate(): string {
  if (typeof window === 'undefined') return "EMERGENCY ALERT: I am in danger. My location is: {{location}}";
  const stored = localStorage.getItem(MESSAGE_TEMPLATE_KEY);
  return stored || "EMERGENCY ALERT: I am in danger. My location is: {{location}}";
}

export function setMessageTemplate(template: string): void {
  localStorage.setItem(MESSAGE_TEMPLATE_KEY, template);
}

export function getUserName(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(USER_NAME_KEY) || '';
}

export function setUserName(name: string): void {
  localStorage.setItem(USER_NAME_KEY, name);
}

export function getChildModeConfig(): ChildModeConfig {
  if (typeof window === 'undefined') return { enabled: false, username: '', password: '', trackingActive: false };
  const stored = localStorage.getItem(CHILD_MODE_KEY);
  return stored ? JSON.parse(stored) : { enabled: false, username: '', password: '', trackingActive: false };
}

export function setChildModeConfig(config: ChildModeConfig): void {
  localStorage.setItem(CHILD_MODE_KEY, JSON.stringify(config));
}
