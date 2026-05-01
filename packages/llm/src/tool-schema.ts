import type Anthropic from "@anthropic-ai/sdk";

// Field descriptions are intentionally detailed — this pushes the tool schema to ~900 tokens
// so that system (~250) + tool (~900) = ~1,150 tokens, clearing Haiku's 1,024-token cache minimum.
// Expanding descriptions here does not change extraction behavior; the system prompt handles that.
export const SUBMIT_EXTRACTION_TOOL: Anthropic.Messages.Tool = {
  name: "submit_extraction",
  description:
    "Submit the complete structured clinical extraction for this doctor-patient transcript. " +
    "Call this tool exactly once with all extracted fields populated. " +
    "Use null for any field that is not explicitly stated or clearly implied in the transcript. " +
    "Do not invent or infer values that are not present in the text.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"],
    properties: {
      chief_complaint: {
        type: "string",
        minLength: 1,
        description:
          "The patient's primary reason for this visit, stated in their own words or as a brief clinical summary. " +
          "Use the patient's language where possible (e.g. 'sore throat and fever for three days'). " +
          "This should capture the presenting complaint as it was communicated at the start of the encounter, " +
          "not the final diagnosis.",
      },
      vitals: {
        type: "object",
        additionalProperties: false,
        required: ["bp", "hr", "temp_f", "spo2"],
        description:
          "Vital signs recorded at this encounter. Set each sub-field to null if that specific vital " +
          "was not measured or mentioned in the transcript. Do not estimate or interpolate values.",
        properties: {
          bp: {
            type: ["string", "null"],
            pattern: "^[0-9]{2,3}/[0-9]{2,3}$",
            description:
              "Blood pressure as a string in systolic/diastolic format (e.g. '128/82' or '110/70'). " +
              "Both values must be present; use two or three digit integers separated by a forward slash. " +
              "Set to null if blood pressure was not taken or not mentioned in the transcript. " +
              "Telehealth visits commonly have null blood pressure.",
          },
          hr: {
            type: ["integer", "null"],
            minimum: 20,
            maximum: 250,
            description:
              "Heart rate in beats per minute as a whole integer (e.g. 72 or 110). " +
              "Set to null if heart rate was not recorded in this encounter. " +
              "Valid range is 20 to 250 bpm.",
          },
          temp_f: {
            type: ["number", "null"],
            minimum: 90,
            maximum: 110,
            description:
              "Body temperature in degrees Fahrenheit as a decimal number (e.g. 98.6 or 101.2). " +
              "If the transcript states temperature in Celsius, convert to Fahrenheit before submitting. " +
              "Set to null if temperature was not taken or not stated. " +
              "Valid range is 90°F to 110°F.",
          },
          spo2: {
            type: ["integer", "null"],
            minimum: 50,
            maximum: 100,
            description:
              "Oxygen saturation as a whole integer percentage (e.g. 98 or 95). " +
              "This is typically measured by pulse oximetry. " +
              "Set to null if oxygen saturation was not recorded in this encounter. " +
              "Valid range is 50 to 100 percent.",
          },
        },
      },
      medications: {
        type: "array",
        description:
          "All medications discussed during this encounter, including medications that were newly prescribed, " +
          "continued without change, dose-adjusted, or explicitly stopped or discontinued. " +
          "Include over-the-counter medications, supplements, and inhalers if mentioned. " +
          "Each medication should appear as a separate object in this array.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "dose", "frequency", "route"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              description:
                "The medication name as stated in the transcript, using generic or brand name as given. " +
                "Do not standardize or substitute names — use exactly what was said.",
            },
            dose: {
              type: ["string", "null"],
              description:
                "The dose as stated, including amount and unit (e.g. '400 mg', '10 units', '0.5 mL'). " +
                "Preserve the exact format used in the transcript. " +
                "Set to null if no dose was mentioned.",
            },
            frequency: {
              type: ["string", "null"],
              description:
                "How often the medication is taken, as stated in the transcript " +
                "(e.g. 'twice daily', 'every 6 hours as needed', 'once daily at bedtime', 'BID'). " +
                "Preserve abbreviations if used. Set to null if frequency was not mentioned.",
            },
            route: {
              type: ["string", "null"],
              description:
                "The administration route as stated or clearly implied " +
                "(e.g. 'PO' for oral, 'IV' for intravenous, 'IM' for intramuscular, " +
                "'SC' or 'SQ' for subcutaneous, 'topical', 'inhaled', 'SL' for sublingual, 'PR' for rectal). " +
                "Set to null if route was not mentioned.",
            },
          },
        },
      },
      diagnoses: {
        type: "array",
        description:
          "Working or confirmed diagnoses stated by the physician during this encounter. " +
          "Include only diagnoses the physician explicitly stated or confirmed — do not generate diagnoses from symptoms alone. " +
          "Each distinct diagnosis should be a separate object.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description"],
          properties: {
            description: {
              type: "string",
              minLength: 1,
              description:
                "The diagnosis as the physician stated it (e.g. 'viral upper respiratory infection', " +
                "'type 2 diabetes mellitus', 'community-acquired pneumonia'). " +
                "Use the physician's exact terminology where possible.",
            },
            icd10: {
              type: "string",
              pattern: "^[A-Z][0-9]{2}(\\.[0-9A-Z]{1,4})?$",
              description:
                "ICD-10-CM code only if the physician explicitly mentioned it in the transcript " +
                "(e.g. 'J06.9' for viral URI, 'E11.9' for type 2 diabetes). " +
                "Do not generate or look up codes — only include if stated. " +
                "Omit this field entirely if no ICD-10 code was mentioned.",
            },
          },
        },
      },
      plan: {
        type: "array",
        description:
          "The management plan as a list of concise free-text strings, one string per discrete action. " +
          "Include all planned actions: prescriptions written, tests or imaging ordered, referrals made, " +
          "patient instructions given, lifestyle advice, and return precautions. " +
          "Split compound actions into separate items where clinically distinct.",
        items: {
          type: "string",
          minLength: 1,
          description: "A single discrete plan item stated by the physician.",
        },
      },
      follow_up: {
        type: "object",
        additionalProperties: false,
        required: ["interval_days", "reason"],
        description:
          "The planned follow-up for this patient. Both fields should be null if no specific follow-up was discussed.",
        properties: {
          interval_days: {
            type: ["integer", "null"],
            minimum: 0,
            maximum: 730,
            description:
              "The follow-up interval in days as a whole integer. " +
              "Convert weeks to days if needed (e.g. '2 weeks' → 14, '1 month' → 30). " +
              "Set to null if no specific return interval was mentioned or if the physician said to return only if symptoms worsen.",
          },
          reason: {
            type: ["string", "null"],
            description:
              "The stated reason for the follow-up visit (e.g. 'recheck blood pressure', " +
              "'review lab results', 'wound check'). " +
              "Set to null if no reason was specified or if no follow-up was planned.",
          },
        },
      },
    },
  },
};
