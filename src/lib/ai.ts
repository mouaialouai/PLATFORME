import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/**
 * Helper to handle retries for AI calls, specifically for 429 Rate Limits.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error);
      const isRateLimit = 
        error?.status === "RESOURCE_EXHAUSTED" || 
        errorStr.includes("429") || 
        errorStr.includes("RESOURCE_EXHAUSTED") ||
        (error instanceof Error && (error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED")));
      
      const isTransientError = 
        error?.status === "INTERNAL" || 
        error?.status === "UNAVAILABLE" ||
        errorStr.includes("500") ||
        errorStr.includes("503") ||
        errorStr.includes("Rpc failed") ||
        errorStr.includes("xhr error");

      if ((isRateLimit || isTransientError) && i < maxRetries - 1) {
        const delay = Math.pow(2, i + 1) * 2000 + Math.random() * 1000; // Start with 4s, 8s...
        console.warn(`${isRateLimit ? 'Rate limit' : 'Transient error'} hit. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export type TrainingMode = 'presentiel' | 'alternance' | 'qualification';

export interface LessonPhase {
  phase: string;
  content: string;
  method: string;
  duration: string;
}

export interface APCCardPhase {
  phase: string;
  teacherActivity: string;
  traineeActivity: string;
  materials: string;
  duration: string;
  evaluation: string;
}

export interface DetailedLesson {
  introduction: string;
  professionalProblemSituation: string;
  analysis: string;
  coreConcepts: string;
  practicalWorkflow: string[];
  algerianExamples: string[];
  exercises: string[];
}

export interface VisualSupport {
  diagrams: string;
  realLifeVisuals: string;
  tools: string;
}

export interface LessonSkeleton {
  week: number;
  title: string;
  practicalObjective: string;
  prerequisites: string[];
  materials: string[];
  evaluation: string;
  location: 'EFP' | 'Enterprise';
  type: 'theory' | 'practical';
}

export interface ModuleSkeleton {
  id: string;
  name: string;
  hourlyVolume: string;
  efpHours?: string; // For Alternance (FTTC at EFP)
  enterpriseHours?: string; // For Alternance (Practical at Enterprise)
  weeklyHours: string;
  generalObjective: string;
  intermediateObjectives: string[];
  contentElements: string[];
  evaluationCriteria: string[];
  competencies: string[];
  lessons: LessonSkeleton[];
}

export interface SemesterSkeleton {
  id: string;
  title: string;
  modules: ModuleSkeleton[];
}

export interface ProgramSkeleton {
  specializationName: string;
  description: string;
  totalHours: string;
  edition: string;
  trainingMode?: TrainingMode;
  semesters: SemesterSkeleton[];
}

export interface DualLanguageSkeleton {
  ar: ProgramSkeleton;
  fr: ProgramSkeleton;
}

export interface Exam {
  questions: string[];
  solutions: string[];
}

export interface FullLessonDetails {
  introduction: string;
  professionalSituation: string;
  methodology: string;
  teacherScript: string;
  detailedConcepts: string;
  algerianExamples: string[];
  lessonType: 'theory' | 'practical';
  location: 'EFP' | 'Enterprise';
  practicalWork: {
    task: string;
    steps: string[];
    tools: string[];
    safety: string[];
  };
  exercises: {
    question: string;
    solution: string;
    difficulty: string;
  }[];
  suggestedTest: {
    title: string;
    questions: string[];
    solutions: string[];
  };
  classroomInteraction: string;
  lessonEvaluation: {
    questions: string[];
    practicalTasks: string[];
    detailedCorrection: string;
  };
  summary: string;
  visualSupport: {
    visuals: {
      title: string;
      description: string;
      aiPrompt: string;
      type: 'diagram' | 'tool' | 'installation' | 'other';
      phase: string; // Linked to APC phase
    }[];
  };
  // Standard FP tables
  phasesTable: LessonPhase[];
  apcTable: (APCCardPhase & { subSituations?: string[] })[];
}

export interface ExamParams {
  specialization: string;
  module_name: string;
  module_code: string;
  teacher_name?: string;
  institution_name?: string;
  semester_title: string;
  lessons_summary: string;
  ui_language: "AR" | "FR";
  exam_type: "comprehensive_1" | "comprehensive_2" | "remedial" | "control_1" | "control_2";
}

/**
 * Smart Lesson Plan Generator (HTML Output)
 * Generates a structured lesson plan in HTML format based on CBA/APC principles.
 */
export async function generateStructuredLessonPlan(params: {
  specialization: string;
  subject: string;
  lesson_title: string;
  lesson_content: string;
  learner_level: string;
  session_duration: string;
  teacher_name?: string;
  institution_name?: string;
  ui_language: "AR" | "FR";
}): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    You are an expert instructional designer specialized in Competency-Based Approach (CBA) used in Algerian vocational training.

    🎯 TASK:
    Generate a complete structured lesson plan in table format based on the provided educational content.

    IMPORTANT:
    - The OUTPUT content must be in Arabic.
    - The UI labels must support Arabic and French (based on a parameter).
    - The structure must strictly follow competency-based pedagogy.

    -----------------------------------
    📥 INPUT PARAMETERS:
    - institution: ${params.institution_name || "................"}
    - teacher: ${params.teacher_name || "................"}
    - specialization: ${params.specialization}
    - subject: ${params.subject}
    - lesson_title: ${params.lesson_title}
    - lesson_content: ${params.lesson_content}
    - learner_level: ${params.learner_level}
    - session_duration: ${params.session_duration}
    - ui_language: ${params.ui_language}

    -----------------------------------
    📌 UI LANGUAGE RULE:
    IF ui_language = "AR":
    → Use Arabic labels (e.g., المؤسسة، الأستاذ، المراحل...)

    IF ui_language = "FR":
    → Use French labels (e.g., Établissement, Formateur, Phases...)

    BUT:
    ⚠️ The lesson CONTENT (explanations, competencies, activities) must ALWAYS be in Arabic.

    -----------------------------------
    📤 OUTPUT STRUCTURE:

    1️⃣ HEADER TABLE (مخطط الدرس):
    Generate a structured table with:
    - المؤسسة (Institution): ${params.institution_name || "................"} | الأستاذ (Teacher): ${params.teacher_name || "................"}
    - الاختصاص (Specialization) | المقياس (Subject)
    - رقم الدرس (Lesson No) | عنوان الدرس (Lesson Title)
    - رقم الحصة (Session No) | عنوان الحصة (Session Title)
    - الكفاءة المستهدفة (Target Competency) - Full width row.

    -----------------------------------
    2️⃣ RESOURCES & REFERENCES TABLE:
    Columns:
    - المراجع (References)
    - الوسائل التعليمية (Teaching Resources)
    - المعارف المستهدفة (Targeted Knowledge)

    -----------------------------------
    3️⃣ MAIN LESSON FLOW TABLE (سير الحصة):
    Columns:
    - المراحل (Phases)
    - الزمن (Time)
    - النشاطات والمعارف المكتسبة (Activities & Knowledge)
    - مؤشرات الكفاءة (Performance Indicators)
    - التقويم (Assessment)

    -----------------------------------
    4️⃣ LESSON PHASES CONTENT:

    🔹 وضعية الانطلاق (Start Situation):
    - الإشكالية (Problematic): Generate a professional problem situation.
    - مؤشرات الكفاءة: يسترجع مكتسباته القبلية، يستمع وينتبه...

    🔹 بناء التعلمات (Learning Construction):
    Split content into sub-situations (الوضعية الجزئية 01, 02...):
    - النشاطات: يناقش، يتبادل الأفكار، يستنتج ويكتب...
    - المعارف: The actual technical content.
    - التقويم: تكويني (Formative).

    🔹 التقويم النهائي (Final Assessment):
    - النشاطات: يستثمر معلوماته.
    - التقويم: نهائي (Summative).

    -----------------------------------
    📌 RULES:
    - Use clean structured tables (prefer HTML tables)
    - No empty placeholders (...)
    - DO NOT summarize. Provide full detailed and expanded content for every section.
    - Keep logical pedagogical progression
    - Make it ready for printing or export (PDF/Word)
    - Use Inline CSS for styling (borders, padding, background colors for headers).
    - Ensure RTL support for Arabic text.
    - ADD A STYLE BLOCK AT THE TOP:
      <style>
        .plan-container { font-family: 'Arial', sans-serif; direction: rtl; color: #333; line-height: 1.6; }
        .plan-header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: white; }
        th, td { border: 1px solid #cbd5e1; padding: 12px; text-align: right; }
        th { background-color: #f8fafc; color: #1e293b; font-weight: bold; }
        .section-title { background-color: #e2e8f0; font-weight: bold; padding: 10px; border: 1px solid #cbd5e1; margin-top: 20px; }
        .highlight { color: #2563eb; font-weight: bold; }
      </style>
      Wrap the entire content in <div class="plan-container">.

    -----------------------------------
    📌 OUTPUT FORMAT:
    Return ONLY the result as well-formatted HTML with tables and RTL support for Arabic. No markdown code blocks, just raw HTML.
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.7,
      },
    });

    if (!response.text) throw new Error("No response from AI");
    
    let html = response.text.trim();
    // Remove markdown code blocks if present
    if (html.startsWith("```html")) {
      html = html.replace(/^```html\n?/, "").replace(/\n?```$/, "");
    } else if (html.startsWith("```")) {
      html = html.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }
    
    return html;
  });
}

/**
 * Module Plan Generator (HTML Output)
 * Generates a structured module plan (مخطط المقياس) in HTML format.
 */
export async function generateModulePlan(params: {
  specialization: string;
  specialization_code: string;
  module_name: string;
  module_code: string;
  competency_code: string;
  competency_type: string;
  lesson_no: string;
  duration: string;
  content_elements: string[];
  intermediate_objectives: string[];
  competencies_links: string[];
  teacher_name?: string;
  institution_name?: string;
  ui_language: "AR" | "FR";
}): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    You are an expert instructional designer for Algerian vocational training (APC/CBA).
    🎯 TASK: Generate a COMPLETE "Module Plan" (مخطط المقياس) in HTML format for the ENTIRE module (MQ/MC).
    
    The plan must cover all content elements of the module in a comprehensive table.

    -----------------------------------
    📥 INPUT:
    - المؤسسة: ${params.institution_name || "................"}
    - الأستاذ: ${params.teacher_name || "................"}
    - الاختصاص: ${params.specialization}
    - رمز التخصص: ${params.specialization_code}
    - رقم وعنوان المقياس: ${params.module_name} (${params.module_code})
    - رمز الكفاءة: ${params.competency_code}
    - نوع الكفاءة: ${params.competency_type}
    - الروابط (الكفاءات السابقة): ${(params.competencies_links || []).join(", ")}
    - الأهداف الوسيطة: ${(params.intermediate_objectives || []).join(" | ")}
    - رقم الدرس/المرحلة: ${params.lesson_no}
    - مدة المقياس الإجمالية: ${params.duration}
    - عناصر المحتوى: ${(params.content_elements || []).join(", ")}

    -----------------------------------
    📤 OUTPUT STRUCTURE (مخطط المقياس):

    1️⃣ HEADER SECTION:
    - Title: "مخطط المقياس" (Centered, Bold, Large, Background: Dark Red, Color: White)
    - Table with 2 columns and multiple rows:
      * Row 0: [المؤسسة: ${params.institution_name || "................"}] | [الأستاذ: ${params.teacher_name || "................"}]
      * Row 1: [الاختصاص: ${params.specialization}] | [رمز التخصص: ${params.specialization_code}]
      * Row 2: [رقم وعنوان المقياس: ${params.module_name} (${params.module_code})] | [رمز الكفاءة: ${params.competency_code}]
      * Row 3: [هذه الكفاءة مرتبطة بالكفاءة أو الكفاءات السابقة رقم: ${(params.competencies_links || []).join(", ")}] (Full width)
      * Row 4: [نوع الكفاءة: المهنية ${params.competency_type === 'المهنية' ? '☑' : '☐'} المكملة ${params.competency_type === 'المكملة' ? '☑' : '☐'}] | [رقم الدرس: ${params.lesson_no}]
      * Row 5: [مدة الدرس: ${params.duration}] | [المرحلة أو الدقة: (Summarize the general objective)]

    2️⃣ MAIN CONTENT TABLE (9 Columns):
    Columns:
    1. المرحلة أو الدقة (الهدف من التكوين): Derived from intermediate objectives.
    2. الروابط: (e.g., MQ1, MQ2...)
    3. عناصر المحتوى: List each element from input as a separate row.
    4. المدة: Distribute the total duration (${params.duration}) among elements.
    5. الأحداث البيداغوجية (ما أفعله / ما يفعله المتربص): 
       - الأستاذ: (عرض تنشيطي، شرح، توضيح...)
       - المتربص: (متابعة، طرح أسئلة، تطبيق...)
    6. الأجهزة والمعدات: (حواسيب، جهاز عرض، أدوات تقنية...)
    7. الوسائل التعليمية (الكمية): (عرض تقديمي، مطبوعات، دليل تقني...)
    8. المحل البيداغوجي: (قاعة متخصصة، ورشة...)
    9. تقويم تكويني: (استكشاف، معرفة، تطبيق، تمكن...)

    -----------------------------------
    📌 RULES:
    - Output must be in Arabic.
    - Use clean HTML tables with RTL support.
    - Use Inline CSS for professional styling (borders: 1px solid black, padding: 5px, background colors for headers: #f2f2f2).
    - Ensure the table is wide enough for printing (A4 Landscape style).
    - NO markdown blocks. Return raw HTML.
    - ADD A STYLE BLOCK AT THE TOP:
      <style>
        .module-plan-container { font-family: 'Arial', sans-serif; direction: rtl; color: #1a1a1a; }
        .main-title { background: #991b1b; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; border-radius: 4px; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
        th, td { border: 1px solid #000; padding: 8px; text-align: center; }
        th { background-color: #fee2e2; color: #991b1b; }
        .header-table td { text-align: right; background-color: #f9fafb; }
      </style>
      Wrap the entire content in <div class="module-plan-container">.
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.7 },
    });

    if (!response.text) throw new Error("No response from AI");
    
    let html = response.text.trim();
    if (html.startsWith("```html")) {
      html = html.replace(/^```html\n?/, "").replace(/\n?```$/, "");
    } else if (html.startsWith("```")) {
      html = html.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }
    
    return html;
  });
}

/**
 * Module Exam Generator (HTML Output)
 * Generates a comprehensive or remedial exam for a module based on the provided template.
 */
export async function generateModuleExam(params: ExamParams, isModelAnswer: boolean = false): Promise<string> {
  const model = "gemini-3-flash-preview";
  
  const examTitle = {
    comprehensive_1: "الامتحان الشامل (النموذج 1)",
    comprehensive_2: "الامتحان الشامل (النموذج 2)",
    remedial: "الامتحان الاستدراكي",
    control_1: "المراقبة المستمرة رقم 01",
    control_2: "المراقبة المستمرة رقم 02"
  }[params.exam_type];

  const controlNote = params.exam_type === "control_1" 
    ? "ملاحظة: الأسئلة تغطي الدروس من الأسبوع 01 إلى الأسبوع 07 فقط."
    : params.exam_type === "control_2"
    ? "ملاحظة: الأسئلة تغطي الدروس من الأسبوع 08 إلى الأسبوع 11 فقط."
    : "";

  const prompt = `
    You are an expert examiner for Algerian vocational training (APC/CBA).
    🎯 TASK: Generate a ${isModelAnswer ? "MODEL ANSWER" : "EXAM PAPER"} for ${examTitle} in HTML format for the module: ${params.module_name}.
    
    EDUCATIONAL LEVEL: The questions should be balanced (not too simple, not too complex) and appropriate for the specialization: ${params.specialization}.

    -----------------------------------
    📥 INPUT:
    - Institution: ${params.institution_name || "................"}
    - Teacher: ${params.teacher_name || "................"}
    - Specialization: ${params.specialization}
    - Module: ${params.module_name} (${params.module_code})
    - Semester: ${params.semester_title}
    - Lessons Summary: ${params.lessons_summary}
    - Exam Type: ${examTitle}
    - ${controlNote}

    -----------------------------------
    📤 VISUAL TEMPLATE RULES (CRITICAL):
    The HTML must strictly follow this visual layout for a "PREMIUM" and "PROFESSIONAL" look, optimized for A4 printing:
    
    1. PAGE SETUP:
       - Use a container with: width: 100%; font-family: 'Traditional Arabic', 'Arial', sans-serif; direction: rtl; color: #000; background: #fff;
       - MARGINS: 0.27mm on all sides.
       - NO OUTER BORDER or shadows.
       - Support for 2 pages if content is long.

    2. HEADER (Top Section):
       - Centered text:
         الجمهورية الجزائرية الديمقراطية الشعبية
         وزارة التكوين والتعليم المهنيين
         مديرية التكوين والتعليم المهنيين لولاية تبسة
         ${params.institution_name || "مركز التكوين المهني والتمهين - زارع عبد الباقي - تبسة - 2"}
       - NO LOGO placeholders.
       - Bold, centered, font-size: 16px.

    3. INFO BOXES:
       - A table with 2 columns (width: 100%, border-collapse: collapse, margin-top: 20px):
       - [RIGHT CELL]:
         * الفرع: ${params.specialization}
         * الرمز: ${params.module_code}
         * المادة: ${params.module_name}
         * الأستاذ الوصي: ${params.teacher_name || "................"}
       - [LEFT CELL]:
         * التاريخ: ................
         * المدة: 02 سا
         * النقطة الإقصائية: 05 / 20
         * المعامل: ................
         * الاسم واللقب: ................................
       - Each cell should have a solid 1px border and padding: 10px.

    4. MAIN TITLE:
       - A centered div with a border (border: 1px solid #000) and light grey background (background: #f9f9f9).
       - Text: ${examTitle} - ${params.semester_title}
       - ${isModelAnswer ? "<br>(الإجابة النموذجية مع سلم التنقيط)" : ""}
       - Font-size: 18px, Bold.

    5. CONTENT:
       - High-quality technical questions derived from the Module content.
       - ${controlNote}
       - Structure:
         * الجزء الأول: أسئلة نظرية (Theoretical) - [06 ن]
         * الجزء الثاني: وضعية إشكالية / تطبيقية (Practical/Scenario) - [10 ن]
         * الجزء الثالث: رسم تقني / مخطط (Diagram/Drawing) - [04 ن]
       - ${isModelAnswer ? "For each question, provide the correct detailed answer AND the mark allocation clearly (e.g., [02 ن])." : "Leave space for answers."}
       - ANSWER SPACES: If not a model answer, provide ample space for answers using THIN DOTTED LINES (................................) instead of empty space or solid lines. The number of dotted lines should match the expected length of the answer (e.g., 3-5 lines for a short answer, 10+ for a detailed explanation). NO extra empty lines between dotted lines.
       - Use clear numbering (1/, 2/, 3/...).

    6. FOOTER:
       - Page numbering at the bottom (e.g., الصفحة 1/2).

    -----------------------------------
    📌 TECHNICAL RULES:
    - Output must be in Arabic.
    - Use Inline CSS ONLY.
    - NO markdown blocks. Return raw HTML.
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: { temperature: 0.7 },
    });

    if (!response.text) throw new Error("No response from AI");
    
    let html = response.text.trim();
    if (html.startsWith("```html")) {
      html = html.replace(/^```html\n?/, "").replace(/\n?```$/, "");
    } else if (html.startsWith("```")) {
      html = html.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }
    
    return html;
  });
}
/**
 * Extracts the structure of the program (Modules and Lesson Titles).
 */
export async function analyzeProgramSkeleton(
  files: { data: string; mimeType: string }[],
  trainingMode: TrainingMode,
  fastMode: boolean = false
): Promise<DualLanguageSkeleton> {
  // Use Flash for both modes for better speed and reliability in extraction
  const model = "gemini-3-flash-preview"; 
  
  const modeDescription = {
    presentiel: "Full in-class theoretical and practical training in the training center. 17 lessons per module, full APC content, full semester hours.",
    alternance: "Alternating training between training center (FTTC/EFP) and enterprise. Theoretical lessons at FTTC/EFP, practical application at the enterprise. Each module MUST generate EXACTLY 17 lessons corresponding to the FTTC theoretical part. Distinguish between FTTC/EFP hours and Enterprise hours.",
    qualification: "Short specialized or remedial training. Adjusted module content and hours; full APC lesson structure; competency-based."
  }[trainingMode];

  const fastModeInstructions = fastMode ? `
    ⚡ STEP 1: FAST MODULE EXTRACTION (CRITICAL)
    - GOAL: Extract ONLY the module list (MQ/MC) and their basic info.
    - IGNORE detailed lesson content. Return an empty array [] for "lessons".
    - Focus on speed and identifying ALL modules.
    - DETECTION RULE: Extract any line containing MQ + number or MC + number.
    - VALIDATION: If MQ count < 13 or MC count < 2 -> RE-SCAN logic.
  ` : `
    FULL_EXTRACTION_MODE (CRITICAL):
    - Extract ALL modules (MQ/MC) and their full metadata (objectives, content, criteria).
    - Map modules to semesters accurately using 'Tableau de répartition semestrielle'.
    - LESSON TITLES: ONLY extract lesson titles if they are EXPLICITLY listed in a table or list in the document.
    - IF LESSON TITLES ARE NOT EXPLICITLY LISTED, return an empty array [] for "lessons". DO NOT generate them.
    - DO NOT SKIP ANY MODULE. If there are 15 MQ modules, you MUST return 15 MQ modules.
    - If the document is long, take your time to process all pages.
  `;

  const prompt = `
    You are an expert AI system specialized in Algerian Vocational Training (FP) and APC (Competency-Based Approach).
    🎯 TASK: Extract the training program skeleton from the provided images/documents.
    
    ${fastModeInstructions}

    -----------------------------------
    📥 EXTRACTION STEPS:
    1. SPECIALIZATION: Identify the specialization name.
    2. MODULES (MQ & MC):
       - Scan for tables titled "Tableau de répartition semestrielle" or "Liste des modules".
       - Extract ALL modules starting with MQ or MC.
       - Extract: Code (id), Title (name), Semester, Weekly Hours, Total Hours.
       - Extract Objectives, Content Elements, and Evaluation Criteria.
    3. VALIDATION:
       - Expected MQ modules: at least 13.
       - Expected MC modules: at least 2.
       - If you find fewer, RE-SCAN the entire document.
    4. LESSON_TITLE_GENERATION:
       - Provide a list of 17 lesson titles ONLY IF they are explicitly listed in the document.
       - IF NOT LISTED, return an empty array for "lessons". DO NOT generate them now.
       - Focus on extracting ALL modules (MQ and MC) accurately.
    
    TRAINING MODE CONTEXT:
    ${modeDescription}
    
    CORE RULES:
    - Return ONLY valid JSON.
    - DO NOT truncate the JSON.
    - The ROOT object MUST have exactly two keys: "ar" and "fr".
    - DO NOT return the program data directly at the root.
    - Ensure both "ar" and "fr" keys are present and complete.
    - Focus on getting ALL modules (MQ1, MQ2... MC1, MC2...).
    
    JSON SCHEMA:
    {
      "ar": {
        "specializationName": "...",
        "description": "...",
        "totalHours": "...",
        "edition": "...",
        "trainingMode": "${trainingMode}",
        "semesters": [
          {
            "id": "S1",
            "title": "السداسي 1",
            "modules": [
              {
                "id": "MQ1",
                "name": "...",
                "hourlyVolume": "...",
                "weeklyHours": "...",
                "generalObjective": "...",
                "intermediateObjectives": ["..."],
                "contentElements": ["..."],
                "evaluationCriteria": ["..."],
                "lessons": [
                  {
                    "week": 1,
                    "title": "...",
                    "practicalObjective": "...",
                    "location": "EFP/Enterprise",
                    "type": "theory/practical"
                  }
                ]
              }
            ]
          }
        ]
      },
      "fr": { ... same structure in French ... }
    }
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            ...files.map(file => ({
              inlineData: {
                mimeType: file.mimeType,
                data: file.data,
              },
            })),
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    if (!response.text) throw new Error("No response from AI");
    
    let cleanJson = response.text.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    }
    
    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON Parse Error. Attempting light parsing mode fallback.");
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          // If it's still failing, it might be truncated. Try to fix it.
          const fixedJson = jsonMatch[0] + '}]}]}}'; // Very basic attempt to close structures
          try {
            parsed = JSON.parse(fixedJson);
          } catch (e3) {
            throw e;
          }
        }
      } else {
        throw e;
      }
    }

    // REPAIR STEP: Ensure both 'ar' and 'fr' exist.
    // Check for common variations
    if (parsed) {
      if (Array.isArray(parsed)) {
        console.warn("AI returned an array at the root. Wrapping in a skeleton structure.");
        const skeleton = { semesters: [{ id: "S1", title: "S1", modules: parsed }] };
        parsed = { ar: skeleton, fr: skeleton };
      }
      if (!parsed.ar && !parsed.fr && parsed.data) { parsed = parsed.data; }
      if (!parsed.ar && parsed.arabic) { parsed.ar = parsed.arabic; delete parsed.arabic; }
      if (!parsed.fr && parsed.french) { parsed.fr = parsed.french; delete parsed.french; }
      if (!parsed.ar && parsed.AR) { parsed.ar = parsed.AR; delete parsed.AR; }
      if (!parsed.fr && parsed.FR) { parsed.fr = parsed.FR; delete parsed.FR; }
    }

    // If the AI returned the ProgramSkeleton directly at the root, wrap it.
    if (parsed && !parsed.ar && !parsed.fr) {
      if (parsed.specializationName || parsed.semesters || parsed.modules || parsed.id) {
        console.warn("AI returned ProgramSkeleton directly. Wrapping in 'ar' and 'fr'.");
        const skeleton = JSON.parse(JSON.stringify(parsed));
        parsed = { ar: skeleton, fr: skeleton };
      }
    }

    // If one is missing, clone the other to avoid "Invalid data structure" error in App.tsx
    if (parsed && !parsed.ar && parsed.fr) {
      console.warn("AI returned only 'fr' data. Cloning to 'ar' to prevent crash.");
      parsed.ar = JSON.parse(JSON.stringify(parsed.fr));
    } else if (parsed && parsed.ar && !parsed.fr) {
      console.warn("AI returned only 'ar' data. Cloning to 'fr' to prevent crash.");
      parsed.fr = JSON.parse(JSON.stringify(parsed.ar));
    }

    if (!parsed || (!parsed.ar && !parsed.fr)) {
      console.error("Invalid AI Response Structure:", parsed);
      throw new Error(`AI returned JSON without 'ar' or 'fr' keys. Keys found: ${parsed ? Object.keys(parsed).join(', ') : 'none'}`);
    }

    return parsed as DualLanguageSkeleton;
  });
}

/**
 * Generates the 17 lesson titles for a specific module based on its objectives and content.
 */
export async function generateModuleLessons(
  module: ModuleSkeleton,
  language: 'ar' | 'fr',
  trainingMode: TrainingMode = 'presentiel'
): Promise<LessonSkeleton[]> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    You are an expert Algerian vocational training teacher specialized in APC (Approche Par Compétences).
    🎯 TASK: Generate a list of EXACTLY 17 lesson titles for the module: "${module.name}" (${module.id}).
    
    MODULE CONTEXT:
    - General Objective: ${module.generalObjective}
    - Intermediate Objectives: ${module.intermediateObjectives.join(', ')}
    - Content Elements: ${module.contentElements.join(', ')}
    - Training Mode: ${trainingMode}
    
    RULES:
    - Generate EXACTLY 17 lessons (one per week).
    - Each lesson MUST have: week (1-17), title, practicalObjective, prerequisites, materials, evaluation, location (EFP/Enterprise), type (theory/practical).
    - The progression MUST be logical and pedagogical.
    - Return ONLY valid JSON.
    - Language: ${language === 'ar' ? 'Arabic' : 'French'}.
    
    JSON SCHEMA:
    [
      {
        "week": 1,
        "title": "...",
        "practicalObjective": "...",
        "prerequisites": ["..."],
        "materials": ["..."],
        "evaluation": "...",
        "location": "EFP",
        "type": "theory"
      },
      ...
    ]
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    if (!response.text) throw new Error("No response from AI");
    
    let cleanJson = response.text.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    }
    
    const lessons = JSON.parse(cleanJson);
    if (!Array.isArray(lessons) || lessons.length === 0) {
      throw new Error("Invalid lessons format returned from AI");
    }
    
    return lessons as LessonSkeleton[];
  });
}

/**
 * Full Lesson Generation (Lazy Loading)
 * Generates the complete APC pedagogical content for a specific lesson.
 */
export async function generateFullLesson(
  moduleName: string,
  lessonTitle: string,
  objective: string,
  language: 'ar' | 'fr',
  trainingMode: TrainingMode = 'presentiel',
  lessonType: 'theory' | 'practical' = 'theory',
  location: 'EFP' | 'Enterprise' = 'EFP'
): Promise<FullLessonDetails> {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    You are an expert Algerian vocational training teacher specialized in APC (Approche Par Compétences).
    Your mission is to generate a FULL PROFESSIONAL LESSON CONTENT that represents a REAL teaching session in class or at the enterprise.

    INPUT:
    Module: ${moduleName}
    Lesson Title: ${lessonTitle}
    Training Mode: ${trainingMode.toUpperCase()}
    Lesson Type: ${lessonType.toUpperCase()}
    Location: ${location.toUpperCase()}

    CONTEXT:
    - If Location is EFP: Focus on theoretical foundations, technical concepts, and simulated practical work.
    - If Location is Enterprise: Focus on REAL workplace application, professional gestures, safety in the field, and technical reporting.
    - If Lesson Type is Practical: Generate a "Practical Activity Sheet" (بطاقة نشاط تطبيقي) structure.

    MAIN OBJECTIVE:
    Generate a COMPLETE, EXHAUSTIVE, and HIGHLY DETAILED lesson that:
    - Can be taught directly by a teacher or followed by a tutor in the enterprise WITHOUT ANY ADDITIONAL PREPARATION.
    - Covers a full session (duration matching the program, usually 2 to 3 hours).
    - Requires NO additional explanation or external research from the teacher.
    - Is standardized for ALL teachers in Algeria (Nationwide standard).
    - Includes EVERY technical detail, definition, and professional gesture.

    STRICT RULES:
    - DO NOT summarize. DO NOT shorten explanations. DO NOT skip steps.
    - Expand all ideas deeply. Use progressive explanation (simple → complex).
    - Use Algerian professional context (terminology, local standards, real workplace scenarios).
    - Use clear pedagogical Arabic + technical French terms.
    - The teacher script MUST be extremely long, covering every minute of the session (minimum 2500 words).
    - The detailed concepts section MUST be a complete technical reference (minimum 1500 words).
    - VISUALS ARE MANDATORY: You MUST provide at least 8 detailed visuals, ALIGNED with APC phases.
    - For each visual, provide a title, a full description, an AI prompt, and the APC phase it belongs to.

    APC PHASES (MANDATORY):
    1. وضعية الانطلاق (Starting Situation): Motivation, link to real life, professional problem.
    2. بناء التعلمات (Learning Construction): Detailed sub-situations (وضعية تعلمية 1, 2...), teacher/trainee activities.
    3. التطبيق (Application): Practical tasks, exercises.
    4. الإدماج (Integration): Combining skills.
    5. التقويم (Evaluation): Formative and Summative.

    JSON STRUCTURE (MANDATORY):
    {
      "introduction": "Detailed introduction text (تمهيد) including gradual presentation, link to student life, introductory questions, and motivation.",
      "professionalSituation": "Real Algerian professional situation (وضعية مهنية) with a clear technical problem.",
      "methodology": "Detailed pedagogical methodology (المنهجية المتبعة) for this specific lesson, explaining how the competency will be acquired according to APC standards.",
      "teacherScript": "EXACTLY what the teacher says (سيناريو الأستاذ الكامل). Step-by-step explanation, examples, teacher questions, expected trainee answers, classroom interaction, common error correction. MUST BE EXTREMELY LONG AND DETAILED (min 2500 words).",
      "detailedConcepts": "Full explanation of all concepts, accurate definitions, relationships, application examples, professional technical explanation. Deep and technical.",
      "algerianExamples": ["Example 1 from Algerian professional context", "Example 2..."],
      "lessonType": "${lessonType}",
      "location": "${location}",
      "practicalWork": {
        "task": "Real practical task description (Workplace task if Enterprise).",
        "steps": ["Detailed step 1", "Detailed step 2", "..."],
        "tools": ["Tool 1", "Tool 2", "..."],
        "safety": ["Safety precaution 1", "Safety precaution 2", "..."]
      },
      "exercises": [
        { "question": "...", "solution": "...", "difficulty": "easy/medium/hard" }
      ],
      "suggestedTest": {
        "title": "Suggested Weekly Test / Exam",
        "questions": ["Question 1", "Question 2..."],
        "solutions": ["Solution 1", "Solution 2..."]
      },
      "classroomInteraction": "Direct teacher questions, group activities, group discussion, error analysis.",
      "lessonEvaluation": {
        "questions": ["Quiz question 1", "..."],
        "practicalTasks": ["Practical task 1", "..."],
        "detailedCorrection": "Full detailed correction for all evaluation items."
      },
      "summary": "Organized summary (خلاصة الدرس) with key points and link to competency.",
      "visualSupport": {
        "visuals": [
          {
            "title": "...",
            "description": "...",
            "aiPrompt": "...",
            "type": "diagram/tool/installation/other",
            "phase": "وضعية الانطلاق / بناء التعلمات / ..."
          }
        ]
      },
      "phasesTable": [
        { "phase": "تمهيد", "content": "...", "method": "...", "duration": "15 min" },
        { "phase": "عرض", "content": "...", "method": "...", "duration": "..." },
        { "phase": "تطبيق", "content": "...", "method": "...", "duration": "..." },
        { "phase": "تقييم", "content": "...", "method": "...", "duration": "..." }
      ],
      "apcTable": [
        { 
          "phase": "وضعية الانطلاق", 
          "teacherActivity": "...", 
          "traineeActivity": "...", 
          "materials": "...", 
          "duration": "...", 
          "evaluation": "..." 
        },
        { 
          "phase": "بناء التعلمات", 
          "teacherActivity": "...", 
          "traineeActivity": "...", 
          "materials": "...", 
          "duration": "...", 
          "evaluation": "...",
          "subSituations": ["وضعية تعلمية 1: ...", "وضعية تعلمية 2: ..."]
        },
        { "phase": "التطبيق", "teacherActivity": "...", "traineeActivity": "...", "materials": "...", "duration": "...", "evaluation": "..." },
        { "phase": "الإدماج", "teacherActivity": "...", "traineeActivity": "...", "materials": "...", "duration": "...", "evaluation": "..." },
        { "phase": "التقويم النهائي", "teacherActivity": "...", "traineeActivity": "...", "materials": "...", "duration": "...", "evaluation": "..." }
      ]
    }
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
      },
    });

    if (!response.text) throw new Error("No response from AI");
    
    let cleanJson = response.text.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    }
    
    return JSON.parse(cleanJson) as FullLessonDetails;
  });
}
