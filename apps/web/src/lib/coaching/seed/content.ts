/**
 * AI Sales Coach — seed content (Phase 1).
 *
 * Sourced from the PRD's Maiyuri-approved examples + the Maiyuri Bricks
 * Knowledge Wiki (brand/product/objection/sales-coach), with gap topics
 * authored here (engineer call, lead-temperature criteria, pricing/discount,
 * factory-visit script). Everything keys off a stable `slug` so the seed
 * script can upsert idempotently. Admins refine all of this via the CMS.
 *
 * Brand guardrails (from the wiki CLAUDE.md): proof-backed claims only — never
 * "guaranteed cooler", "zero plastering", "100% waterproof", "carbon negative";
 * structural suitability is "subject to engineer approval"; no competitor
 * attacks; always end on a next step.
 */

export interface SeedQuiz {
  slug: string;
  question: string;
  question_type: "mcq" | "fill_blank" | "scenario";
  options?: { key: string; label: string }[];
  correct_answer?: string;
  explanation?: string;
}
export interface SeedLesson {
  slug: string;
  title: string;
  objective?: string;
  content: string;
  examples?: string;
  do_dont_notes?: string;
  quizzes?: SeedQuiz[];
}
export interface SeedModule {
  slug: string;
  title: string;
  description: string;
  role_applicability: string[];
  sequence_order: number;
  lessons: SeedLesson[];
}

const ALL_PATHS = ["production_supervisor", "sales_executive", "factory_coordinator"];

export const SEED_MODULES: SeedModule[] = [
  {
    slug: "brand-foundation",
    title: "Maiyuri Brand Foundation",
    description: "What Maiyuri stands for and how to represent it.",
    role_applicability: ALL_PATHS,
    sequence_order: 1,
    lessons: [
      {
        slug: "what-maiyuri-represents",
        title: "Why Maiyuri Bricks is not just another brick supplier",
        objective: "Explain Maiyuri's value clearly to a customer.",
        content:
          "Maiyuri Bricks helps families build cooler, stronger, smarter homes using red soil-based smart interlock bricks rooted in Tamil construction wisdom. We are not only a brick seller — we provide product guidance, factory proof, project examples, and local Tamil Nadu support. Walls are a lifetime decision: paint and tiles can change later, but walls stay.",
        examples:
          "Customer: Why should I buy from Maiyuri?\nYou: Sir, if you are building your own house, wall material is a lifetime decision. Maiyuri helps you choose a smarter wall system with better comfort, proper guidance, and visible proof you can check at our factory.",
        do_dont_notes:
          "Do explain WHY (comfort, proof, local support). Don't just say 'our brick is best.' Don't attack competitors.",
        quizzes: [
          {
            slug: "position-maiyuri",
            question: "Maiyuri should be positioned mainly as:",
            question_type: "mcq",
            options: [
              { key: "A", label: "Cheapest brick supplier" },
              { key: "B", label: "Smart wall solution for stronger, cooler homes" },
              { key: "C", label: "Normal brick alternative only" },
              { key: "D", label: "A transport company" },
            ],
            correct_answer: "B",
            explanation:
              "Maiyuri competes on total wall value (comfort, strength, proof, local support) — not on being cheapest.",
          },
        ],
      },
      {
        slug: "tone-of-communication",
        title: "Speaking with confidence and humility",
        objective: "Represent the brand well on calls and factory visits.",
        content:
          "Be clear, direct, encouraging and simple. Listen first, then explain. Customers trust proof more than claims — offer to show wall samples, project videos, strength-test videos and the factory process. Always close with a next action.",
        do_dont_notes:
          "Do acknowledge the concern before answering. Don't oversell or promise unrealistic benefits.",
      },
    ],
  },
  {
    slug: "product-knowledge",
    title: "Product Mastery",
    description: "Smart interlock bricks, simply explained.",
    role_applicability: ALL_PATHS,
    sequence_order: 2,
    lessons: [
      {
        slug: "what-is-smart-interlock",
        title: "What is a smart interlock brick?",
        objective: "Explain interlocking and its benefits simply.",
        content:
          "Normal bricks need more mortar and more wall finishing. Interlock bricks are designed to lock with each other, reduce dependency on mortar, improve alignment, and support faster construction. Maiyuri focuses on smart interlock bricks made for Tamil Nadu climate and customer needs. Lab-tested compressive strength for SmartBrick 6 is around 11 N/mm² and water absorption averages about 3% — but always state structural suitability is subject to engineer approval.",
        examples:
          "Customer: How is this different from normal brick?\nYou: Interlock bricks lock together, so you need less mortar and get better alignment and faster work. For your climate, that means a cooler, neater wall.",
        do_dont_notes:
          "Do cite verified figures and add 'subject to engineer approval' for structural claims. Don't promise an exact temperature drop or '100% waterproof'.",
        quizzes: [
          {
            slug: "interlock-benefit",
            question:
              "Maiyuri Bricks should be explained based on total ______ value, not only brick price.",
            question_type: "fill_blank",
            correct_answer: "wall",
            explanation: "We compare total wall value, not just the brick rate.",
          },
        ],
      },
      {
        slug: "kerala-comparison",
        title: "Maiyuri vs Kerala interlock bricks",
        objective: "Handle the Kerala comparison fairly and with proof.",
        content:
          "Don't attack Kerala bricks. Reframe from brick price to total delivered cost: loading, transport, unloading, wastage, wall finish, local support and quality consistency. Maiyuri is made locally for Tamil Nadu customers, and the customer can visit the factory and check quality before deciding.",
        examples:
          "Customer: Kerala brick is cheaper.\nYou: I understand, sir. For your own house the right comparison is total delivered cost and long-term comfort — not only brick rate. You can visit our factory and check the quality before deciding.",
        do_dont_notes:
          "Do ask whether they're comparing brick rate or total delivered cost. Don't say 'Kerala brick is not good.'",
      },
    ],
  },
  {
    slug: "customer-psychology",
    title: "Customer Handling & Psychology",
    description: "What customers care about and how to build trust.",
    role_applicability: ["sales_executive", "production_supervisor"],
    sequence_order: 3,
    lessons: [
      {
        slug: "price-to-value",
        title: "Shifting from price to value",
        objective: "Move the conversation from brick price to total wall value.",
        content:
          "Customers compare price first because they fear paying more without understanding the difference. Acknowledge the concern, then explain total wall value: comfort, speed, quality, delivery reliability, finishing and long-term savings. Then move to a next step (factory visit, cost calculator, technical call).",
        quizzes: [
          {
            slug: "price-objection-best",
            question: "Best way to respond when a customer says the price is high?",
            question_type: "mcq",
            options: [
              { key: "A", label: "Say our product is the best" },
              { key: "B", label: "Immediately offer a discount" },
              { key: "C", label: "Understand the concern and explain total value" },
              { key: "D", label: "Ignore the concern" },
            ],
            correct_answer: "C",
            explanation: "Acknowledge first, then explain total wall value — don't defend or discount reflexively.",
          },
        ],
      },
      {
        slug: "lead-temperature",
        title: "Hot, warm or cold? Reading the lead",
        objective: "Classify a lead's temperature during the call.",
        content:
          "HOT: site finalised, starting soon, engineer aligned or open, asking for quote/visit. WARM: serious but comparing options or timeline 1–3 months out. COLD: early enquiry, no site/timeline, only price-curious. Set the next follow-up date based on temperature: hot within 24–48h, warm weekly, cold nurture.",
        do_dont_notes:
          "Do record temperature + next follow-up date after every call. Don't mark everyone 'hot'.",
      },
    ],
  },
  {
    slug: "objection-handling",
    title: "Objection Handling",
    description: "Natural, brand-safe answers to common objections.",
    role_applicability: ALL_PATHS,
    sequence_order: 4,
    lessons: [
      {
        slug: "engineer-doubt",
        title: "When the engineer is hesitant",
        objective: "Handle engineer/technical doubt and route correctly.",
        content:
          "Acknowledge the engineer's role — they are responsible for safety. Offer technical specs and lab reports, share proof (wall samples, project videos), and suggest a technical discussion or factory visit. For structural decisions, always defer to engineer approval and, when unsure, connect the customer to Maiyuri's technical person or the owner.",
        examples:
          "Customer: My engineer says normal brick is safer.\nYou: That's fair, sir — your engineer is right to be careful. Can we share our lab reports and arrange a short technical call or factory visit so your engineer can decide with full information?",
        do_dont_notes:
          "Do respect the engineer and offer proof + a technical next step. Don't give structural advice beyond approved knowledge.",
        quizzes: [
          {
            slug: "engineer-scenario",
            question:
              "A customer says: 'My engineer does not recommend interlock bricks.' What should you do?",
            question_type: "scenario",
            explanation:
              "Acknowledge the engineer's role, offer technical specs + proof, and suggest a factory visit or technical discussion. Defer structural calls to the engineer.",
          },
        ],
      },
    ],
  },
  {
    slug: "factory-visit",
    title: "Factory Visit Excellence",
    description: "Turn a factory visit into a confident next step.",
    role_applicability: ["production_supervisor", "factory_coordinator"],
    sequence_order: 5,
    lessons: [
      {
        slug: "factory-visit-script",
        title: "A 5-minute factory visit explanation",
        objective: "Welcome visitors and explain the process clearly.",
        content:
          "1) Welcome warmly and ask about their project. 2) Show the red-soil raw material and explain why it suits Tamil Nadu homes. 3) Walk through production and interlock forming. 4) Show finished bricks and how to check quality. 5) Explain quality checks. 6) Close: ask for the next step — share plan/wall quantity, get a quote, or connect with the technical person.",
        do_dont_notes:
          "Do end every visit with a clear next action. Don't overwhelm with jargon — keep it simple and proof-led.",
      },
    ],
  },
  {
    slug: "sales-followup",
    title: "Sales Follow-Up Discipline",
    description: "Follow-up that closes the next action.",
    role_applicability: ["sales_executive", "production_supervisor"],
    sequence_order: 6,
    lessons: [
      {
        slug: "followup-next-action",
        title: "Always close the next action",
        objective: "End every customer contact with a clear next step.",
        content:
          "Follow-up matters because most orders happen after several touches. Classify the lead (hot/warm/cold), update status + next follow-up date, and send a short WhatsApp recap. Never sound desperate — be helpful and specific. Always end with one clear next action: factory visit, cost calculator, plan/quantity share, or technical call.",
        quizzes: [
          {
            slug: "followup-end",
            question: "Every customer call should end with:",
            question_type: "mcq",
            options: [
              { key: "A", label: "A general 'we'll talk later'" },
              { key: "B", label: "One clear next action and a follow-up date" },
              { key: "C", label: "A discount offer" },
              { key: "D", label: "Nothing — wait for the customer" },
            ],
            correct_answer: "B",
            explanation: "A specific next action + follow-up date keeps the lead moving.",
          },
        ],
      },
    ],
  },
];

export interface SeedAssignment {
  slug: string;
  title: string;
  description: string;
  assignment_type:
    | "product_explanation"
    | "lead_followup"
    | "objection_practice"
    | "factory_explanation"
    | "reflection"
    | "custom";
  due_frequency: "daily" | "weekly" | "once";
}

export const SEED_ASSIGNMENTS: SeedAssignment[] = [
  {
    slug: "product-explanation-60s",
    title: "Explain Maiyuri Smart Interlock Bricks in 60 seconds",
    description: "Type a simple, confident, customer-friendly explanation.",
    assignment_type: "product_explanation",
    due_frequency: "daily",
  },
  {
    slug: "followup-5-leads",
    title: "Follow up with 5 leads and update their status",
    description:
      "For each: customer concern, current status, next follow-up date, interest level, notes.",
    assignment_type: "lead_followup",
    due_frequency: "daily",
  },
  {
    slug: "objection-regular-bricks",
    title: "Answer today's objection: 'Why should I not use regular bricks?'",
    description: "Acknowledge, explain total wall value, end with a next action.",
    assignment_type: "objection_practice",
    due_frequency: "daily",
  },
  {
    slug: "daily-reflection",
    title: "Daily reflection",
    description:
      "What customer question was difficult today? What did you learn? Where do you need help?",
    assignment_type: "reflection",
    due_frequency: "daily",
  },
];

export interface SeedKnowledge {
  slug: string;
  category:
    | "brand_story"
    | "product"
    | "pricing"
    | "kerala_comparison"
    | "objection"
    | "approved_phrases"
    | "avoid_phrases"
    | "factory_visit"
    | "faq";
  title: string;
  content: string;
}

export const SEED_KNOWLEDGE: SeedKnowledge[] = [
  {
    slug: "kb-brand-promise",
    category: "brand_story",
    title: "Brand promise",
    content:
      "Maiyuri helps families build cooler, stronger, smarter homes using red soil-based smart interlock bricks rooted in Tamil construction wisdom. We sell guidance + proof + local support, not just bricks.",
  },
  {
    slug: "kb-approved-phrases",
    category: "approved_phrases",
    title: "Approved phrases",
    content:
      "‘total wall value’, ‘subject to engineer approval’, ‘you can visit the factory and check’, ‘lab-tested’, ‘made locally for Tamil Nadu’.",
  },
  {
    slug: "kb-avoid-phrases",
    category: "avoid_phrases",
    title: "Phrases to avoid",
    content:
      "Never say: ‘guaranteed cooler’, ‘zero plastering’, ‘100% waterproof’, ‘carbon negative’, or attack competitors. No fixed temperature-drop promises.",
  },
  {
    slug: "kb-price-objection",
    category: "objection",
    title: "Objection: costlier than Kerala brick",
    content:
      "Acknowledge, then reframe to total delivered cost (loading, transport, unloading, wastage, wall finish, local support, quality). Follow-up question: ‘Are you comparing only brick rate, or total delivered cost?’ Next action: send cost calculator + invite factory visit.",
  },
  {
    slug: "kb-lead-temperature",
    category: "faq",
    title: "Lead temperature criteria",
    content:
      "HOT: site finalised + starting soon + asking for quote/visit. WARM: serious but comparing / 1–3 months out. COLD: early, no site/timeline, price-curious.",
  },
];
