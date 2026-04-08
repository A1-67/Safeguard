'use server';
/**
 * @fileOverview Emergency Dispatch AI Flow.
 * 
 * Generates a high-priority, detailed emergency summary 
 * for email dispatch, respecting user-defined templates.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DispatchInputSchema = z.object({
  userName: z.string().describe('The full name of the user in trouble.'),
  locationLink: z.string().describe('The Google Maps URL of the user.'),
  customTemplate: z.string().describe('The user\'s saved message template.'),
  contactsCount: z.number().describe('Number of contacts being notified.'),
});

export type DispatchInput = z.infer<typeof DispatchInputSchema>;

const DispatchOutputSchema = z.object({
  finalMessage: z.string().describe('The final high-priority email body.'),
  subject: z.string().describe('The urgent subject line for the email.'),
  priorityLevel: z.enum(['CRITICAL', 'URGENT']).describe('The calculated priority level.'),
});

export type DispatchOutput = z.infer<typeof DispatchOutputSchema>;

export async function dispatchEmergency(input: DispatchInput): Promise<DispatchOutput> {
  return dispatchEmergencyFlow(input);
}

const prompt = ai.definePrompt({
  name: 'dispatchEmergencyPrompt',
  input: { schema: DispatchInputSchema },
  output: { schema: DispatchOutputSchema },
  prompt: `You are the Safe Guard Emergency Dispatch AI. 
A user named {{{userName}}} has triggered a CRITICAL emergency alert.

Your task is to generate a high-priority EMAIL for their emergency contacts using their provided template.

User Name: {{{userName}}}
User Location: {{{locationLink}}}
User Template: {{{customTemplate}}}
Total Contacts Notified: {{{contactsCount}}}

STRICT REQUIREMENTS FOR OUTPUT:
1. Subject line MUST be exactly: "{{{userName}}} is in trouble"
2. The email body MUST include the User Template. 
3. You MUST replace any instance of "{{location}}" in the User Template with the actual User Location: {{{locationLink}}}.
4. If the User Template does not contain the location, append "Here is my location: {{{locationLink}}}" at the bottom.
5. Maintain the user's tone but ensure it remains professional and urgent.

Output the content as 'finalMessage' and the subject as 'subject'.`,
});

const dispatchEmergencyFlow = ai.defineFlow(
  {
    name: 'dispatchEmergencyFlow',
    inputSchema: DispatchInputSchema,
    outputSchema: DispatchOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
