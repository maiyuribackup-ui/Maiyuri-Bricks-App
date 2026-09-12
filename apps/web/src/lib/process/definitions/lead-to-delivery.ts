/**
 * Reference process: New WhatsApp Lead → Delivery (PRD §4, §12).
 *
 * This is DATA. It is imported through `process_import_definition` and then
 * frozen as version 1.0; changing the business flow means authoring 1.1 and
 * publishing it, never editing rows of a published version.
 *
 * Sales stages read the lead's existing `pipeline_stage` in their gates so
 * the CRM board and the process never disagree about where a lead is.
 * Factory stages read ops-control (stock, reservations, trips) and Odoo.
 */
import type { ProcessDefinitionInput } from "@maiyuri/shared";

const SALES = "SALES_ENGINEER" as const;
const FACTORY = "FACTORY_MANAGER" as const;
const FINANCE = "FINANCE" as const;

export const LEAD_TO_DELIVERY_KEY = "LEAD_TO_DELIVERY";

export const leadToDeliveryV1: ProcessDefinitionInput = {
  process_key: LEAD_TO_DELIVERY_KEY,
  name: "Lead to Delivery",
  category: "SALES",
  description:
    "One case per customer enquiry: from the first WhatsApp message through qualification, quotation, advance, factory handover, production, quality release and delivery to post-delivery follow-up.",
  version: "1.0",
  entity_type: "lead",
  stages: [
    {
      key: "NEW_LEAD",
      name: "New Lead",
      description:
        "A new prospect has contacted us. Create or match the CRM lead and respond fast.",
      type: "ACTION",
      owner_role: SALES,
      sla_minutes: 15,
      is_start: true,
      checklist: [
        {
          key: "CREATE_OR_MATCH_LEAD",
          title: "Create or match the CRM lead",
          required: true,
          evidence_required: false,
        },
        {
          key: "ACKNOWLEDGE_CUSTOMER",
          title: "Acknowledge the customer (first response)",
          required: true,
          evidence_required: false,
        },
        {
          key: "CAPTURE_NAME",
          title: "Capture contact name and phone",
          required: true,
          evidence_required: false,
        },
        {
          key: "CAPTURE_LOCATION",
          title: "Capture site location",
          required: true,
          evidence_required: false,
        },
        {
          key: "CAPTURE_SOURCE",
          title: "Identify lead source",
          required: false,
          evidence_required: false,
        },
        {
          key: "CREATE_NEXT_ACTION",
          title: "Set the next action and follow-up date on the lead",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
        {
          key: "CRM_LEAD_EXISTS",
          type: "entity_field",
          condition: { table: "leads", field: "id", exists: true },
          failure_message: "The CRM lead record is missing",
          overridable: false,
        },
        {
          key: "FIRST_RESPONSE_RECORDED",
          type: "entity_field",
          condition: {
            table: "leads",
            field: "lead_status",
            not_in: ["new_contact_pending"],
          },
          failure_message:
            "Record the first response on the lead (status is still new_contact_pending)",
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "QUALIFICATION",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: { sop_slug: "sales-new-lead-response", evidence_types: ["note"] },
    },
    {
      key: "QUALIFICATION",
      name: "Qualification",
      description:
        "Understand the project and decide: qualified, nurture, or disqualified (with reason).",
      type: "DECISION",
      owner_role: SALES,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "PROJECT_STAGE",
          title: "Project stage and type",
          required: true,
          evidence_required: false,
        },
        {
          key: "BUILT_UP_AREA",
          title: "Built-up area and wall type",
          required: true,
          evidence_required: false,
        },
        {
          key: "PLAN_AVAILABILITY",
          title: "Is a plan / drawing available?",
          required: true,
          evidence_required: false,
        },
        {
          key: "KEY_CONCERN",
          title: "Customer's key concern (cost, strength, look, speed)",
          required: true,
          evidence_required: false,
        },
        {
          key: "STAKEHOLDERS",
          title: "Architect / engineer / builder involved",
          required: false,
          evidence_required: false,
        },
        {
          key: "TIMELINE",
          title: "Expected construction timeline",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
        {
          key: "OUTCOME",
          type: "decision_outcome",
          condition: { in: ["QUALIFIED", "NURTURE", "DISQUALIFIED"] },
          overridable: false,
        },
      ],
      transitions: [
        {
          key: "QUALIFIED",
          to: "TECHNICAL_FIT",
          condition: { outcome: "QUALIFIED" },
          priority: 10,
          is_exception: false,
          label: "Qualified",
        },
        {
          key: "NURTURE",
          to: "FOLLOW_UP",
          condition: { outcome: "NURTURE" },
          priority: 20,
          is_exception: false,
          label: "Nurture",
        },
        {
          key: "DISQUALIFIED",
          to: "CLOSED",
          condition: { outcome: "DISQUALIFIED" },
          priority: 30,
          is_exception: false,
          label: "Disqualified",
        },
      ],
      automations: [],
      config: {
        sop_slug: "sales-lead-qualification",
        outcomes: ["QUALIFIED", "NURTURE", "DISQUALIFIED"],
        outcomes_requiring_reason: ["DISQUALIFIED", "NURTURE"],
      },
    },
    {
      key: "TECHNICAL_FIT",
      name: "Plan / Technical Fit",
      description:
        "Establish the product and application basis before quoting.",
      type: "ACTION",
      owner_role: SALES,
      sla_minutes: 2880,
      is_start: false,
      checklist: [
        {
          key: "REQUEST_DRAWING",
          title: "Request the drawing / plan",
          required: true,
          evidence_required: false,
        },
        {
          key: "WALL_REQUIREMENTS",
          title:
            "Identify wall requirements (load-bearing, partition, exposed)",
          required: true,
          evidence_required: false,
        },
        {
          key: "SELECT_PRODUCT",
          title: "Select candidate product(s)",
          required: true,
          evidence_required: false,
        },
        {
          key: "TECHNICAL_REVIEW",
          title: "Flag structural / technical review if required",
          required: false,
          evidence_required: false,
        },
        {
          key: "QUANTITY_BASIS",
          title: "Estimate quantity basis",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "QUOTATION",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: {
        sop_slug: "sales-technical-fit",
        evidence_types: ["drawing", "note"],
      },
    },
    {
      key: "QUOTATION",
      name: "Quotation",
      description: "Create the quotation in Odoo and link it to the lead.",
      type: "ACTION",
      owner_role: SALES,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "CREATE_ODOO_QUOTE",
          title: "Create the quotation in Odoo",
          required: true,
          evidence_required: false,
        },
        {
          key: "CONFIRM_PRODUCT_QTY",
          title: "Confirm product and quantity",
          required: true,
          evidence_required: false,
        },
        {
          key: "CONFIRM_PRICE_TAX",
          title: "Confirm price, tax and transport",
          required: true,
          evidence_required: false,
        },
        {
          key: "CONFIRM_TERMS",
          title: "Exclusions, validity and payment terms stated",
          required: true,
          evidence_required: false,
        },
        {
          key: "SHARE_QUOTE",
          title: "Share the quotation with the customer",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
        {
          key: "QUOTE_EXISTS",
          type: "odoo_quote_linked",
          condition: {},
          failure_message: "No Odoo quotation is linked to this lead yet",
          overridable: false,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "FOLLOW_UP",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: { sop_slug: "sales-quotation", evidence_types: ["quotation"] },
    },
    {
      key: "FOLLOW_UP",
      name: "Follow-Up",
      description:
        "Clarifications, factory visit, negotiation. The system flags stale qualified leads.",
      type: "WAIT",
      owner_role: SALES,
      sla_minutes: 4320,
      is_start: false,
      checklist: [
        {
          key: "FOLLOW_UP_DONE",
          title: "Follow up with the customer and record the outcome",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "CUSTOMER_ACCEPTANCE",
          condition: {},
          priority: 10,
          is_exception: false,
          label: "Customer ready to proceed",
        },
        {
          key: "REVISE_QUOTE",
          to: "QUOTATION",
          condition: {},
          priority: 20,
          is_exception: true,
          label: "Revise quotation",
        },
        {
          key: "REQUALIFY",
          to: "QUALIFICATION",
          condition: {},
          priority: 30,
          is_exception: true,
          label: "Back to qualification",
        },
        {
          key: "LOST",
          to: "CLOSED",
          condition: {},
          priority: 40,
          is_exception: true,
          label: "Lead lost",
        },
      ],
      automations: [],
      config: { sop_slug: "sales-follow-up" },
    },
    {
      key: "CUSTOMER_ACCEPTANCE",
      name: "Customer Acceptance",
      description:
        "Customer confirms intention to proceed. This does NOT commit the factory.",
      type: "ACTION",
      owner_role: SALES,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "CONFIRM_ORDER_IN_ODOO",
          title: "Confirm the sales order in Odoo",
          required: true,
          evidence_required: false,
        },
        {
          key: "RECORD_CONFIRMATION",
          title: "Record the customer's confirmation (message / call)",
          required: true,
          evidence_required: true,
          evidence_type: "customer_confirmation",
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
        {
          key: "CUSTOMER_CONFIRMED",
          type: "manual_confirmation",
          condition: {
            role: "SALES_ENGINEER",
            evidence_type: "customer_confirmation",
          },
          failure_message:
            "Attach the customer's confirmation before proceeding",
          overridable: true,
        },
        {
          key: "ORDER_CONFIRMED",
          type: "entity_field",
          condition: { table: "leads", field: "odoo_order_id", not_null: true },
          failure_message: "The Odoo sales order is not linked to this lead",
          overridable: false,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "ADVANCE_VERIFICATION",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: {
        sop_slug: "sales-order-confirmation",
        evidence_types: ["customer_confirmation"],
      },
    },
    {
      key: "ADVANCE_VERIFICATION",
      name: "Advance Verification",
      description:
        "Finance verifies the advance from the authoritative source. Sales cannot bypass this.",
      type: "ACTION",
      owner_role: FINANCE,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "VERIFY_ADVANCE",
          title: "Verify the advance receipt against the bank / Odoo",
          required: true,
          evidence_required: true,
          evidence_type: "payment_reference",
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: false,
        },
        {
          key: "ADVANCE_VERIFIED",
          type: "advance_verified",
          condition: { min_percent: 30, auto_from_odoo: false },
          failure_message: "Advance is not verified",
          overridable: false,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "FACTORY_HANDOVER",
          condition: {},
          priority: 10,
          is_exception: false,
        },
        {
          key: "PAYMENT_PENDING",
          to: "FOLLOW_UP",
          condition: {},
          priority: 20,
          is_exception: true,
          label: "Payment pending",
        },
      ],
      automations: [],
      config: {
        sop_slug: "accounts-advance-verification",
        evidence_types: ["payment_reference"],
      },
    },
    {
      key: "FACTORY_HANDOVER",
      name: "Factory Handover",
      description:
        "Factory receives the full package and accepts a feasible plan or returns it with a structured exception.",
      type: "HANDOVER",
      owner_role: FACTORY,
      sla_minutes: 240,
      is_start: false,
      checklist: [
        {
          key: "CHECK_STOCK",
          title: "Check available finished stock",
          required: true,
          evidence_required: false,
        },
        {
          key: "CHECK_RESERVED",
          title: "Check reserved stock",
          required: true,
          evidence_required: false,
        },
        {
          key: "CHECK_CURING",
          title: "Review current curing stock",
          required: true,
          evidence_required: false,
        },
        {
          key: "PRODUCTION_REQUIREMENT",
          title: "Calculate production requirement",
          required: true,
          evidence_required: false,
        },
        {
          key: "RAW_MATERIAL",
          title: "Confirm raw-material availability",
          required: true,
          evidence_required: false,
        },
        {
          key: "CAPACITY",
          title: "Confirm production capacity",
          required: true,
          evidence_required: false,
        },
        {
          key: "DELIVERY_DATE",
          title: "Confirm achievable delivery date",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: false,
        },
        {
          key: "HANDOVER_ACCEPTED",
          type: "handover_accepted",
          condition: {},
          failure_message: "Factory has not accepted the handover",
          overridable: false,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "PRODUCTION_ALLOCATION",
          condition: {},
          priority: 10,
          is_exception: false,
        },
        {
          key: "RETURN_TO_SALES",
          to: "CUSTOMER_ACCEPTANCE",
          condition: {},
          priority: 20,
          is_exception: true,
          label: "Returned with exception",
        },
      ],
      automations: [],
      config: {
        sop_slug: "factory-handover-acceptance",
        handover_payload_fields: [
          "customer_name",
          "order_ref",
          "product_name",
          "quantity",
          "payment_status",
          "requested_delivery_date",
          "site_location",
          "contact_person",
          "contact_phone",
          "architect_or_builder",
          "special_requirements",
          "commitments",
          "notes",
        ],
      },
    },
    {
      key: "PRODUCTION_ALLOCATION",
      name: "Production / Allocation",
      description: "Reserve available stock and plan the production gap.",
      type: "ACTION",
      owner_role: FACTORY,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "RESERVE_STOCK",
          title: "Reserve available + curing stock for the order",
          required: true,
          evidence_required: false,
        },
        {
          key: "PLAN_PRODUCTION",
          title: "Create or link the production plan for the gap",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "QUALITY_RELEASE",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: { sop_slug: "factory-production-planning" },
    },
    {
      key: "QUALITY_RELEASE",
      name: "Quality Release",
      description: "Only QC-released stock may be delivered.",
      type: "ACTION",
      owner_role: FACTORY,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "QC_CHECK",
          title: "Quality check on the allocated batches",
          required: true,
          evidence_required: true,
          evidence_type: "qc_release",
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: false,
        },
        {
          key: "QC_RELEASED",
          type: "manual_confirmation",
          condition: { role: "FACTORY_MANAGER", evidence_type: "qc_release" },
          failure_message: "QC release has not been recorded by the factory",
          overridable: false,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "DELIVERY_PLANNING",
          condition: {},
          priority: 10,
          is_exception: false,
        },
        {
          key: "QC_HOLD",
          to: "PRODUCTION_ALLOCATION",
          condition: {},
          priority: 20,
          is_exception: true,
          label: "QC hold — re-plan",
        },
      ],
      automations: [],
      config: {
        sop_slug: "factory-qc-release",
        evidence_types: ["qc_release", "photo", "lab_report"],
      },
    },
    {
      key: "DELIVERY_PLANNING",
      name: "Delivery Planning",
      description:
        "Vehicle, route, date, site contact, unloading and commercial release.",
      type: "ACTION",
      owner_role: FACTORY,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "CONFIRM_QTY_SITE",
          title: "Confirm quantity, customer and site",
          required: true,
          evidence_required: false,
        },
        {
          key: "VEHICLE_ROUTE",
          title: "Assign vehicle and route",
          required: true,
          evidence_required: false,
        },
        {
          key: "DELIVERY_DATE",
          title: "Confirm delivery date with the customer",
          required: true,
          evidence_required: false,
        },
        {
          key: "SITE_CONTACT",
          title: "Site contact and unloading arrangement",
          required: true,
          evidence_required: false,
        },
        {
          key: "COMMERCIAL_RELEASE",
          title: "Payment / commercial release confirmed",
          required: true,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
        {
          key: "STOCK_READY",
          type: "stock_feasible",
          condition: { as_of: "requested_delivery_date" },
          failure_message:
            "Reserved stock cannot cover the order on the delivery date",
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "DISPATCH",
          condition: {},
          priority: 10,
          is_exception: false,
        },
        {
          key: "STOCK_SHORT",
          to: "PRODUCTION_ALLOCATION",
          condition: {},
          priority: 20,
          is_exception: true,
          label: "Stock short — re-plan",
        },
      ],
      automations: [],
      config: { sop_slug: "dispatch-delivery-planning" },
    },
    {
      key: "DISPATCH",
      name: "Dispatch",
      description: "Load, document and send the vehicle.",
      type: "ACTION",
      owner_role: FACTORY,
      sla_minutes: 480,
      is_start: false,
      checklist: [
        {
          key: "LOADED_QTY",
          title: "Record loaded quantity",
          required: true,
          evidence_required: false,
        },
        {
          key: "VEHICLE_DRIVER",
          title: "Record vehicle and driver",
          required: true,
          evidence_required: false,
        },
        {
          key: "DOCUMENTS",
          title: "Delivery documents issued",
          required: true,
          evidence_required: false,
        },
        {
          key: "LOADING_DAMAGE",
          title: "Note any loading damage",
          required: false,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "DELIVERED",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: { sop_slug: "dispatch-loading", evidence_types: ["photo"] },
    },
    {
      key: "DELIVERED",
      name: "Delivered",
      description:
        "Actual delivered quantity, shortage / damage, customer acknowledgment.",
      type: "ACTION",
      owner_role: FACTORY,
      sla_minutes: 1440,
      is_start: false,
      checklist: [
        {
          key: "DELIVERED_QTY",
          title: "Record actual delivered quantity and time",
          required: true,
          evidence_required: false,
        },
        {
          key: "SHORTAGE_DAMAGE",
          title: "Record shortage / damage if any",
          required: false,
          evidence_required: false,
        },
        {
          key: "CUSTOMER_ACK",
          title: "Customer acknowledgment captured",
          required: true,
          evidence_required: true,
          evidence_type: "delivery_ack",
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
        {
          key: "DELIVERY_COMPLETED",
          type: "linked_record_status",
          condition: { type: "delivery", status: "completed", optional: true },
          failure_message: "The linked delivery is not completed",
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "POST_DELIVERY",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: {
        sop_slug: "dispatch-delivery-completion",
        evidence_types: ["delivery_ack", "photo"],
      },
    },
    {
      key: "POST_DELIVERY",
      name: "Post-Delivery Follow-Up",
      description:
        "Back to sales: confirmation, issues, next batch, installation guidance, testimonial.",
      type: "ACTION",
      owner_role: SALES,
      sla_minutes: 4320,
      is_start: false,
      checklist: [
        {
          key: "CUSTOMER_CONFIRMATION",
          title: "Customer confirms delivery and satisfaction",
          required: true,
          evidence_required: false,
        },
        {
          key: "ISSUE_FOLLOW_UP",
          title: "Any issue followed up",
          required: false,
          evidence_required: false,
        },
        {
          key: "NEXT_BATCH",
          title: "Next batch / order discussed",
          required: false,
          evidence_required: false,
        },
        {
          key: "INSTALLATION_GUIDANCE",
          title: "Installation guidance shared",
          required: false,
          evidence_required: false,
        },
      ],
      gates: [
        {
          key: "CHECKLIST",
          type: "checklist_complete",
          condition: {},
          overridable: true,
        },
      ],
      transitions: [
        {
          key: "NEXT",
          to: "COMPLETED",
          condition: {},
          priority: 10,
          is_exception: false,
        },
      ],
      automations: [],
      config: { sop_slug: "sales-post-delivery" },
    },
    {
      key: "COMPLETED",
      name: "Completed",
      description: "Order delivered and closed.",
      type: "END",
      owner_role: SALES,
      sla_minutes: null,
      is_start: false,
      checklist: [],
      gates: [],
      transitions: [],
      automations: [],
      config: {},
    },
    {
      key: "CLOSED",
      name: "Closed (no order)",
      description: "Lead disqualified or lost.",
      type: "END",
      owner_role: SALES,
      sla_minutes: null,
      is_start: false,
      checklist: [],
      gates: [],
      transitions: [],
      automations: [],
      config: {},
    },
  ],
};

/** All built-in definitions, by key. Seeded through the admin import route. */
export const BUILT_IN_DEFINITIONS: Record<string, ProcessDefinitionInput> = {
  [LEAD_TO_DELIVERY_KEY]: leadToDeliveryV1,
};
