import type { FormQuestionType } from '@/lib/data/types';

export interface StarterForm {
  id: string;
  name: string;
  description: string;
  summary: string;
  questions: { question_text: string; question_type: FormQuestionType; options: string[] | null; required: boolean }[];
}

const yesNo = (text: string, required = true) => ({
  question_text: text,
  question_type: 'single_choice' as const,
  options: ['Yes', 'No'],
  required,
});

// Ready-made forms a coach can add in one tap and then edit. The wording is a sensible starting
// point, not legal advice: check it against the gym's own insurance and waiver before relying on it.
export const STARTER_FORMS: StarterForm[] = [
  {
    id: 'parq',
    name: 'Health & readiness questionnaire (PAR-Q)',
    summary: '11 questions: health screening plus a consent line',
    description:
      'Quick health screen before training starts. If any answer is Yes, speak to the member before they begin.',
    questions: [
      yesNo('Has a doctor ever said you have a heart condition, or that you should only do physical activity recommended by a doctor?'),
      yesNo('Do you feel pain in your chest when you do physical activity?'),
      yesNo('In the past month, have you had chest pain when you were not doing physical activity?'),
      yesNo('Do you lose your balance because of dizziness, or have you ever lost consciousness?'),
      yesNo('Do you have a bone or joint problem that could be made worse by a change in your physical activity?'),
      yesNo('Is a doctor currently prescribing medication for your blood pressure or a heart condition?'),
      {
        question_text: 'Are you pregnant, or have you given birth in the last 12 months?',
        question_type: 'single_choice',
        options: ['Yes', 'No', 'Prefer not to say'],
        required: true,
      },
      yesNo('Do you know of any other reason why you should not do physical activity?'),
      {
        question_text: 'If you answered Yes to anything above, please tell us more',
        question_type: 'long_text',
        options: null,
        required: false,
      },
      {
        question_text: 'Any current injuries, medical conditions or medication we should know about?',
        question_type: 'long_text',
        options: null,
        required: false,
      },
      {
        question_text: 'I confirm my answers are correct and I am happy to take part in training.',
        question_type: 'single_choice',
        options: ['I agree'],
        required: true,
      },
    ],
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle & habits intake',
    summary: '8 questions: sleep, stress, work, food and training history',
    description: 'Helps a coach understand day-to-day life before building a plan.',
    questions: [
      {
        question_text: 'How many hours do you usually sleep on a work night?',
        question_type: 'number',
        options: null,
        required: true,
      },
      {
        question_text: 'How would you describe your stress levels right now?',
        question_type: 'single_choice',
        options: ['Low', 'Moderate', 'High', 'Very high'],
        required: true,
      },
      {
        question_text: 'What does a normal working day look like for you?',
        question_type: 'single_choice',
        options: ['Mostly seated', 'On my feet some of the day', 'Physically active job', 'Shift work'],
        required: true,
      },
      {
        question_text: 'What training have you done in the last 6 months?',
        question_type: 'long_text',
        options: null,
        required: true,
      },
      {
        question_text: 'How many meals do you usually eat in a day?',
        question_type: 'number',
        options: null,
        required: false,
      },
      {
        question_text: 'Foods you avoid, allergies or dietary requirements',
        question_type: 'long_text',
        options: null,
        required: false,
      },
      {
        question_text: 'What has got in the way of reaching your goals before?',
        question_type: 'long_text',
        options: null,
        required: false,
      },
      {
        question_text: 'Which of these do you want help with?',
        question_type: 'multi_choice',
        options: ['Food and nutrition', 'Strength', 'Fat loss', 'Fitness', 'Mobility', 'Motivation and routine'],
        required: false,
      },
    ],
  },
];
