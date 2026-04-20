import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
import { 
  Upload, 
  FileText, 
  Languages, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ChevronRight, 
  Clock, 
  Target,
  BookOpen,
  LayoutGrid,
  CalendarDays,
  Wand2,
  Lightbulb,
  Image as ImageIcon,
  Download,
  FileDown,
  Printer,
  ClipboardList,
  FileSpreadsheet,
  Info,
  Globe,
  GraduationCap,
  Tag,
  Library,
  Book,
  Zap,
  RotateCcw,
  RefreshCw,
  Flag,
  FileQuestion
} from 'lucide-react';
import { 
  analyzeProgramSkeleton, 
  generateFullLesson, 
  generateStructuredLessonPlan,
  generateModulePlan,
  generateModuleExam,
  generateModuleLessons,
  DualLanguageSkeleton, 
  ModuleSkeleton,
  LessonSkeleton, 
  FullLessonDetails,
  TrainingMode
} from './lib/ai';
import html2canvas from 'html2canvas';
import htmlToDocx from 'html-to-docx';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel } from 'docx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type Language = 'ar' | 'fr';
type Tab = 'overview' | 'modules' | 'planner' | 'generator' | 'content' | 'visuals' | 'exams' | 'export' | 'lessonPlan' | 'modulePlan' | 'moduleExam' | 'modelAnswer';

export default function App() {
  const [language, setLanguage] = useState<Language>('fr');
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('presentiel');
  const [activeTab, setActiveTab] = useState<Tab>('modules');
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>('');
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [programData, setProgramData] = useState<DualLanguageSkeleton | null>(null);
  const [fullLessons, setFullLessons] = useState<Record<string, FullLessonDetails>>({});
  const [selectedSemester, setSelectedSemester] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<number | null>(null);
  const [selectedLessonIdx, setSelectedLessonIdx] = useState<number | null>(null);
  const [analysisCache, setAnalysisCache] = useState<Record<string, DualLanguageSkeleton>>({});
  const [structuredLessonPlan, setStructuredLessonPlan] = useState<string | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [modulePlan, setModulePlan] = useState<string | null>(null);
  const [isGeneratingModulePlan, setIsGeneratingModulePlan] = useState(false);
  const [teacherName, setTeacherName] = useState(localStorage.getItem('fp_teacher_name') || '');
  const [centerName, setCenterName] = useState(localStorage.getItem('fp_center_name') || '');
  const [isEditingLessonPlan, setIsEditingLessonPlan] = useState(false);
  const [isEditingModulePlan, setIsEditingModulePlan] = useState(false);
  const [moduleExams, setModuleExams] = useState<Record<string, string>>({});
  const [modelAnswers, setModelAnswers] = useState<Record<string, string>>({});
  const [isGeneratingModuleExam, setIsGeneratingModuleExam] = useState(false);
  const [isEditingModuleExam, setIsEditingModuleExam] = useState(false);
  const [isGeneratingModelAnswer, setIsGeneratingModelAnswer] = useState(false);
  const [isEditingModelAnswer, setIsEditingModelAnswer] = useState(false);
  const [isGeneratingModuleLessons, setIsGeneratingModuleLessons] = useState(false);
  const [selectedExamType, setSelectedExamType] = useState<"comprehensive_1" | "comprehensive_2" | "remedial" | "control_1" | "control_2">("comprehensive_1");

  // Save teacher and center name to localStorage
  useEffect(() => {
    localStorage.setItem('fp_teacher_name', teacherName);
  }, [teacherName]);

  useEffect(() => {
    localStorage.setItem('fp_center_name', centerName);
  }, [centerName]);

  // Load cache from localStorage on mount
  useEffect(() => {
    const savedCache = localStorage.getItem('fp_analysis_cache');
    if (savedCache) {
      try {
        setAnalysisCache(JSON.parse(savedCache));
      } catch (e) {
        console.error("Failed to load cache", e);
      }
    }
  }, []);

  // Save cache to localStorage when it changes
  useEffect(() => {
    if (Object.keys(analysisCache).length > 0) {
      localStorage.setItem('fp_analysis_cache', JSON.stringify(analysisCache));
    }
  }, [analysisCache]);

  const getFilesHash = (files: File[]) => {
    return files.map(f => `${f.name}-${f.size}-${f.lastModified}`).join('|');
  };

  const toggleLanguage = () => setLanguage(prev => prev === 'ar' ? 'fr' : 'ar');

  const resetProgram = () => {
    if (window.confirm(language === 'ar' ? 'هل أنت متأكد أنك تريد إعادة تعيين البرنامج؟ ستفقد جميع البيانات الحالية.' : 'Êtes-vous sûr de vouloir réinitialiser le programme ? Toutes les données actuelles seront perdues.')) {
      setFiles([]);
      setProgramData(null);
      setFullLessons({});
      setSelectedSemester(null);
      setSelectedModule(null);
      setSelectedLessonIdx(null);
      setActiveTab('modules');
      setError(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(f => 
      f.type === 'application/pdf' || 
      f.type === 'image/png' || 
      f.type === 'image/jpeg' || 
      f.type === 'image/jpg'
    );

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
      setError(null);
    } else {
      setError(language === 'ar' ? 'يرجى تحميل ملفات PDF أو صور صالحة' : 'Veuillez télécharger des fichiers PDF ou des images valides');
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fileToAIFormat = async (file: File, maxPages?: number): Promise<{ data: string; mimeType: string }[]> => {
    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const pagesToProcess = maxPages ? Math.min(totalPages, maxPages) : totalPages;
        
        const chunks: { data: string; mimeType: string }[] = [];
        
        for (let i = 1; i <= pagesToProcess; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.2 }); // Optimized for size
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          if (context) {
            await page.render({ canvasContext: context, viewport, canvas }).promise;
            const base64String = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            chunks.push({ data: base64String, mimeType: 'image/jpeg' });
          }
        }
        
        return chunks;
      } catch (e) {
        console.error("PDF processing error", e);
        return [];
      }
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve([{ data: base64String, mimeType: file.type }]);
      };
      reader.onerror = error => reject(error);
    });
  };

  const startAnalysis = async (fastMode: boolean = false) => {
    if (files.length === 0) return;
    
    const cacheKey = `${getFilesHash(files)}-${trainingMode}-${fastMode ? 'fast' : 'full'}`;
    if (analysisCache[cacheKey]) {
      setProgramData(analysisCache[cacheKey]);
      const current = analysisCache[cacheKey][language];
      if (current && current.semesters && current.semesters.length > 0) {
        setSelectedSemester(current.semesters[0].id);
        if (current.semesters[0].modules && current.semesters[0].modules.length > 0) {
          setSelectedModule(0);
        }
      }
      setActiveTab('overview');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(language === 'ar' ? 'جاري معالجة الملفات...' : 'Traitement des fichiers...');
    setError(null);
    setFullLessons({}); // Reset lessons
    
    let retryCount = 0;
    const maxRetries = 2;
    let success = false;
    let finalResult: DualLanguageSkeleton | null = null;

    while (retryCount <= maxRetries && !success) {
      try {
        setAnalysisProgress(language === 'ar' ? `جاري تحليل البرنامج (محاولة ${retryCount + 1})...` : `Analyse du programme (tentative ${retryCount + 1})...`);
        // Optimization: If fast mode, only process first 8 pages. Full mode up to 25 pages.
        const aiFiles = (await Promise.all(files.map(file => fileToAIFormat(file, fastMode ? 8 : 25)))).flat();
        
        setAnalysisProgress(language === 'ar' ? 'جاري استخراج البيانات بواسطة الذكاء الاصطناعي...' : 'Extraction des données par l\'IA...');
        const result = await analyzeProgramSkeleton(aiFiles, trainingMode, fastMode);
        if (!result) throw new Error("AI returned empty result");
        
        setAnalysisProgress(language === 'ar' ? 'جاري التحقق من اكتمال البيانات...' : 'Validation de l\'intégralité des données...');
        // Validate module completeness
        const langData = result[language];
        if (langData && langData.semesters) {
          const allModules = langData.semesters.flatMap(s => s.modules);
          const mqModules = allModules.filter(m => m.id.toUpperCase().startsWith('MQ'));
          const mcModules = allModules.filter(m => m.id.toUpperCase().startsWith('MC'));
          
          // Relaxed validation: at least 1 module found is a success
          if (allModules.length > 0) {
            success = true;
            finalResult = result;
            
            // Log if it's incomplete but we're accepting it
            if (mqModules.length < 13 || mcModules.length < 2) {
              console.warn(`Extraction partially complete: MQ=${mqModules.length}, MC=${mcModules.length}. Accepting as-is.`);
            }
          } else {
            console.warn(`No modules found. Retrying... (${retryCount + 1}/${maxRetries})`);
            retryCount++;
            if (retryCount > maxRetries) {
              finalResult = result;
              success = true;
            }
          }
        } else {
          throw new Error("Invalid data structure returned from AI");
        }
      } catch (err) {
        console.error(`Analysis attempt ${retryCount + 1} failed:`, err);
        retryCount++;
        if (retryCount > maxRetries) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          setError(language === 'ar' 
            ? `حدث خطأ أثناء تحليل البرنامج: ${errorMessage}` 
            : `Une erreur est survenue lors de l'analyse du programme: ${errorMessage}`);
          setIsAnalyzing(false);
          return;
        }
      }
    }

    if (finalResult) {
      setProgramData(finalResult);
      setAnalysisCache(prev => ({ ...prev, [cacheKey]: finalResult! }));
      const current = finalResult[language];
      if (current && current.semesters && current.semesters.length > 0) {
        setSelectedSemester(current.semesters[0].id);
        if (current.semesters[0].modules && current.semesters[0].modules.length > 0) {
          setSelectedModule(0);
        }
      }
      setActiveTab('overview');
    }
    setIsAnalyzing(false);
  };

  const loadFullLesson = async (moduleName: string, lesson: LessonSkeleton, idx: number, retryCount = 0, force = false) => {
    const lessonKey = `${moduleName}-${lesson.week}-${language}-${trainingMode}`;
    if (fullLessons[lessonKey] && !force) {
      setSelectedLessonIdx(idx);
      setActiveTab('generator');
      return;
    }

    setIsGeneratingLesson(true);
    setError(null);

    try {
      const details = await generateFullLesson(moduleName, lesson.title, lesson.practicalObjective, language, trainingMode, lesson.type, lesson.location);
      setFullLessons(prev => ({ ...prev, [lessonKey]: details }));
      setSelectedLessonIdx(idx);
      setActiveTab('generator');
    } catch (err) {
      console.error("Lesson Generation Error Details:", err);
      if (retryCount < 2) {
        console.log(`Retrying lesson generation... (${retryCount + 1}/2)`);
        setTimeout(() => loadFullLesson(moduleName, lesson, idx, retryCount + 1), 2000);
        return;
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(language === 'ar' 
        ? `حدث خطأ أثناء توليد الدرس: ${errorMessage}` 
        : `Une erreur est survenue lors de la génération du cours: ${errorMessage}`);
    } finally {
      setIsGeneratingLesson(false);
    }
  };

  const loadModuleLessons = async () => {
    if (!programData || selectedSemester === null || selectedModule === null) return;
    
    const semester = programData[language].semesters.find(s => s.id === selectedSemester);
    const module = semester?.modules[selectedModule];
    if (!module) return;

    setIsGeneratingModuleLessons(true);
    setError(null);
    try {
      const lessons = await generateModuleLessons(module, language, trainingMode);
      
      setProgramData(prev => {
        if (!prev) return null;
        const newData = { ...prev };
        const targetSemester = newData[language].semesters.find(s => s.id === selectedSemester);
        
        if (targetSemester && targetSemester.modules[selectedModule]) {
          targetSemester.modules[selectedModule].lessons = lessons;
        }
        return newData;
      });
    } catch (err) {
      console.error("Module lessons generation failed:", err);
      setError(language === 'ar' ? 'فشل توليد قائمة الدروس. يرجى المحاولة مرة أخرى.' : 'Échec de la génération de la liste des leçons. Veuillez réessayer.');
    } finally {
      setIsGeneratingModuleLessons(false);
    }
  };

  const loadStructuredLessonPlan = async (idx?: number) => {
    const lessonIdx = idx !== undefined ? idx : selectedLessonIdx;
    if (!currentData || selectedSemester === null || selectedModule === null || lessonIdx === null) return;
    
    if (idx !== undefined) setSelectedLessonIdx(idx);

    const semester = currentData.semesters.find(s => s.id === selectedSemester);
    const module = semester?.modules[selectedModule];
    const lessonSkeleton = module?.lessons[lessonIdx];
    const lessonKey = `${module?.name}-${lessonSkeleton?.week}-${language}-${trainingMode}`;
    const lessonDetails = fullLessons[lessonKey];

    if (!module || !lessonSkeleton || !lessonDetails) {
      if (idx !== undefined) {
        // If we're calling from the table, we might need to generate the lesson first
        await loadFullLesson(module?.name || '', lessonSkeleton!, lessonIdx);
        // We can't easily chain here because loadFullLesson is also async and updates state
        // But the user can click again or we can try to wait
        return;
      }
      setError(language === 'ar' ? 'يجب توليد محتوى الدرس أولاً' : 'Veuillez d\'abord générer le contenu de la leçon');
      return;
    }

    setIsGeneratingPlan(true);
    try {
      const html = await generateStructuredLessonPlan({
        specialization: currentData.specializationName,
        subject: module.name,
        lesson_title: lessonSkeleton.title,
        lesson_content: lessonDetails.detailedConcepts,
        learner_level: currentData.edition || "Niveau 4",
        session_duration: "3 " + (language === 'ar' ? 'ساعات' : 'Heures'),
        teacher_name: teacherName,
        institution_name: centerName,
        ui_language: language === 'ar' ? 'AR' : 'FR'
      });
      setStructuredLessonPlan(html);
      setActiveTab('lessonPlan');
    } catch (err) {
      console.error(err);
      setError(language === 'ar' ? 'فشل توليد مذكرة الدرس' : 'Échec de la génération de la fiche de leçon');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const loadModulePlan = async (idx?: number) => {
    const lessonIdx = idx !== undefined ? idx : selectedLessonIdx;
    if (!currentData || selectedSemester === null || selectedModule === null || lessonIdx === null) return;
    
    if (idx !== undefined) setSelectedLessonIdx(idx);

    const semester = currentData.semesters.find(s => s.id === selectedSemester);
    const module = semester?.modules[selectedModule];
    const lessonSkeleton = module?.lessons[lessonIdx];

    if (!module || !lessonSkeleton) {
      setError(language === 'ar' ? 'يرجى اختيار وحدة ودرس أولاً' : 'Veuillez d\'abord sélectionner un module et une leçon');
      return;
    }

    setIsGeneratingModulePlan(true);
    try {
      const html = await generateModulePlan({
        specialization: currentData.specializationName,
        specialization_code: "N/A",
        module_name: module.name,
        module_code: module.id,
        competency_code: "N/A",
        competency_type: module.id.startsWith('MQ') ? 'المهنية' : 'المكملة',
        lesson_no: (lessonIdx + 1).toString(),
        duration: module.hourlyVolume || module.weeklyHours || "30",
        content_elements: module.contentElements || [],
        intermediate_objectives: module.intermediateObjectives || [],
        competencies_links: module.competencies || [],
        teacher_name: teacherName,
        institution_name: centerName,
        ui_language: language === 'ar' ? 'AR' : 'FR'
      });
      setModulePlan(html);
      setActiveTab('modulePlan');
    } catch (err) {
      console.error(err);
      setError(language === 'ar' ? 'فشل توليد مخطط المقياس' : 'Échec de la génération du plan du module');
    } finally {
      setIsGeneratingModulePlan(false);
    }
  };

  const loadModuleExam = async (examType: "comprehensive_1" | "comprehensive_2" | "remedial" | "control_1" | "control_2", isModelAnswer: boolean = false) => {
    if (!currentData || selectedSemester === null || selectedModule === null) return;

    const semester = currentData.semesters.find(s => s.id === selectedSemester);
    const module = semester?.modules[selectedModule];

    if (!module) {
      setError(language === 'ar' ? 'يرجى اختيار وحدة أولاً' : 'Veuillez d\'abord sélectionner un module');
      return;
    }

    // Filter lessons based on exam type
    let filteredLessons = module.lessons;
    if (examType === "control_1") {
      filteredLessons = module.lessons.filter(l => l.week <= 7);
    } else if (examType === "control_2") {
      filteredLessons = module.lessons.filter(l => l.week <= 11);
    }

    const lessonsSummary = filteredLessons.map(l => `- ${l.title}: ${l.practicalObjective}`).join('\n');

    setSelectedExamType(examType);
    if (isModelAnswer) setIsGeneratingModelAnswer(true);
    else setIsGeneratingModuleExam(true);

    try {
      const html = await generateModuleExam({
        specialization: currentData.specializationName,
        module_name: module.name,
        module_code: module.id,
        teacher_name: teacherName,
        institution_name: centerName,
        semester_title: semester?.title || "S1",
        lessons_summary: lessonsSummary,
        ui_language: language === 'ar' ? 'AR' : 'FR',
        exam_type: examType
      }, isModelAnswer);

      if (isModelAnswer) {
        setModelAnswers(prev => ({ ...prev, [examType]: html }));
        setActiveTab('modelAnswer');
      } else {
        setModuleExams(prev => ({ ...prev, [examType]: html }));
        setActiveTab('moduleExam');
      }
    } catch (err) {
      console.error(err);
      setError(language === 'ar' ? 'فشل توليد الامتحان' : 'Échec de la génération de l\'examen');
    } finally {
      if (isModelAnswer) setIsGeneratingModelAnswer(false);
      else setIsGeneratingModuleExam(false);
    }
  };

  const downloadAsWord = (html: string, filename: string, orientation: 'p' | 'l' = 'p') => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' "+
            "xmlns:w='urn:schemas-microsoft-com:office:word' "+
            "xmlns='http://www.w3.org/TR/REC-html40'>"+
            "<head><meta charset='utf-8'><title>Export</title><style>"+
            "@page { size: A4 " + (orientation === 'p' ? 'portrait' : 'landscape') + "; margin: 0.27mm; } "+
            "table { border-collapse: collapse; width: 100%; margin-bottom: 20px; } "+
            "th, td { border: 1px solid black; padding: 10px; text-align: right; } "+
            "th { background-color: #f2f2f2; font-weight: bold; } "+
            "body { font-family: 'Arial', sans-serif; direction: rtl; color: #000; background: #fff; }"+
            ".page-container { padding: 40px; margin: 0; }"+
            "h1, h2, h3, h4 { color: #1e3a8a; }"+
            "</style></head><body><div class='page-container'>";
    const footer = "</div></body></html>";
    const sourceHTML = header + html + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], {
      type: 'application/msword'
    });
    
    saveAs(blob, filename + '.doc');
  };

  const currentData = programData ? programData[language] : null;
  const isRTL = language === 'ar';

  const t = {
    title: language === 'ar' ? 'المنصة الذكية للتخطيط البيداغوجي (التكوين المهني)' : 'Plateforme Intelligente de Planification Pédagogique (Formation Pro)',
    designer: language === 'ar' ? 'موايعية عادل أستاذ التكوين المهني بمركز التكوين المهني و التمهين زارع عبد الباقي' : 'Mouaieia Adel, Professeur de Formation Professionnelle au CFPA Zare Abdelbaki',
    designerLabel: language === 'ar' ? 'تصميم وتطوير:' : 'Conçu et développé par :',
    subtitle: language === 'ar' ? 'توليد آلي لمخططات الدروس وفق المقاربة بالكفاءات من ملفات PDF الرسمية' : 'Génération automatique de plans de cours APC à partir de fichiers PDF officiels',
    uploadLabel: language === 'ar' ? 'تحميل البرنامج (PDF أو صور)' : 'Charger le programme (PDF ou Images)',
    uploadHint: language === 'ar' ? 'يمكنك تحميل ملف PDF واحد أو عدة صور للبرنامج' : 'Vous pouvez charger un PDF ou plusieurs images du programme',
    analyzeBtn: language === 'ar' ? 'تحليل البرنامج' : 'Analyser le programme',
    analyzing: language === 'ar' ? 'جاري التحليل والتخطيط...' : 'Analyse et planification en cours...',
    generateFullLesson: language === 'ar' ? 'توليد الدرس الكامل' : 'Générer la leçon complète',
    downloadPDF: language === 'ar' ? 'تحميل PDF' : 'Télécharger PDF',
    reloadProgram: language === 'ar' ? 'إعادة تحميل البرنامج' : 'Recharger le programme',
    results: language === 'ar' ? 'المخطط البيداغوجي السنوي' : 'Planning Pédagogique Annuel',
    volume: language === 'ar' ? 'الحجم الساعي:' : 'Volume horaire :',
    week: language === 'ar' ? 'الأسبوع' : 'Semaine',
    newAnalysis: language === 'ar' ? 'تحليل جديد' : 'Nouvelle analyse',
    noData: language === 'ar' ? 'لا توجد بيانات' : 'Aucune donnée disponible',
    loading: language === 'ar' ? 'جاري التحميل...' : 'Chargement...',
    trainingModeLabel: language === 'ar' ? 'نمط التكوين' : 'Mode de formation',
    downloadFullProgram: language === 'ar' ? 'تحميل البرنامج الكامل' : 'Télécharger le programme complet',
    specialtyCard: language === 'ar' ? 'بطاقة وصفية للتخصص' : 'Fiche descriptive de la spécialité',
    programInfo: language === 'ar' ? 'معلومات البرنامج' : 'Informations du programme',
    edition: language === 'ar' ? 'الطبعة' : 'Édition',
    totalDuration: language === 'ar' ? 'المدة الإجمالية' : 'Durée totale',
    hours: language === 'ar' ? 'ساعة' : 'Heures',
    remove: language === 'ar' ? 'حذف' : 'Supprimer',
    modes: {
      presentiel: {
        title: language === 'ar' ? 'حضوري' : 'Présentiel',
        desc: language === 'ar' ? 'تكوين نظري وتطبيقي كامل في المركز' : 'Formation théorique et pratique complète au centre'
      },
      alternance: {
        title: language === 'ar' ? 'تمهين' : 'Alternance',
        desc: language === 'ar' ? 'تكوين بالتناوب بين المركز والمؤسسة' : 'Formation alternée entre le centre et l\'entreprise'
      },
      qualification: {
        title: language === 'ar' ? 'تأهيلي' : 'Qualification',
        desc: language === 'ar' ? 'تكوين قصير المدى أو تكميلي' : 'Formation de courte durée ou complémentaire'
      }
    },
    programOverview: language === 'ar' ? 'نظرة عامة على البرنامج' : 'Aperçu du Programme',
    exitReload: language === 'ar' ? 'إعادة تحميل' : 'Reload',
    weeklyHours: language === 'ar' ? 'الساعات الأسبوعية:' : 'Heures hebdomadaires :',
    generalObjective: language === 'ar' ? 'الهدف العام:' : 'Objectif général :',
    operationalObjectives: language === 'ar' ? 'الأهداف الإجرائية:' : 'Objectifs opérationnels :',
    competencies: language === 'ar' ? 'الكفاءات المستهدفة:' : 'Compétences visées :',
    downloadModule: language === 'ar' ? 'تحميل الوحدة كاملة' : 'Télécharger le module complet',
    tabs: {
      overview: language === 'ar' ? '📊 عرض السداسيات' : '📊 Show Semesters',
      modules: language === 'ar' ? '📚 عرض الوحدات' : '📚 Show Modules',
      planner: language === 'ar' ? '📖 عرض الدروس' : '📖 Show Lessons',
      generator: language === 'ar' ? '⚡ توليد درس' : '⚡ Generate Lesson',
      content: language === 'ar' ? '📝 المحتوى' : '📝 Content',
      visuals: language === 'ar' ? '🖼️ الوسائل البصرية' : '🖼️ Visuals',
      exams: language === 'ar' ? '🎓 الامتحانات' : '🎓 Exams',
      lessonPlan: language === 'ar' ? '📋 مذكرة درس' : '📋 Fiche de leçon',
      modulePlan: language === 'ar' ? '📑 مخطط المقياس' : '📑 Plan du module',
      moduleExam: language === 'ar' ? '📝 امتحان الوحدة' : '📝 Examen du module',
      modelAnswer: language === 'ar' ? '✅ الإجابة النموذجية' : '✅ Corrigé type',
      export: language === 'ar' ? '⬇️ تحميل' : '⬇️ Download'
    },
    table: {
      week: language === 'ar' ? 'الأسبوع' : 'Semaine',
      title: language === 'ar' ? 'عنوان الدرس' : 'Titre de la leçon',
      competency: language === 'ar' ? 'الكفاءة' : 'Compétence',
      objectives: language === 'ar' ? 'الأهداف' : 'Objectifs',
      content: language === 'ar' ? 'المحتوى' : 'Contenu',
      activities: language === 'ar' ? 'الوضعيات التعليمية' : 'Activités',
      methods: language === 'ar' ? 'الطرق' : 'Méthodes',
      materials: language === 'ar' ? 'الوسائل' : 'Matérials',
      evaluation: language === 'ar' ? 'التقويم' : 'Évaluation',
      pedagogicalMethod: language === 'ar' ? 'الطريقة البيداغوجية' : 'Méخode Pédagogique',
      evaluationCriteria: language === 'ar' ? 'معايير التقويم' : 'Critères d\'évaluation',
      practicalObjective: language === 'ar' ? 'الهدف العملي' : 'Objectif opérationnel',
      prerequisites: language === 'ar' ? 'المكتسبات القبلية' : 'Pré-requis',
      teachingMaterials: language === 'ar' ? 'الوسائل التعليمية' : 'Moyens pédagogiques',
      phase: language === 'ar' ? 'المرحلة' : 'Phase',
      duration: language === 'ar' ? 'المدة' : 'Durée',
      teacherActivity: language === 'ar' ? 'نشاط المكون' : 'Activité du formateur',
      traineeActivity: language === 'ar' ? 'نشاط المتربص' : 'Activité du stagiaire',
      generateLessonPlan: language === 'ar' ? 'توليد مذكرة الدرس' : 'Générer la fiche de leçon',
      generateModulePlan: language === 'ar' ? 'توليد مخطط المقياس' : 'Générer le plan du module',
      generateModuleExam: language === 'ar' ? 'توليد امتحان الوحدة' : 'Générer l\'examen du module',
      generateModelAnswer: language === 'ar' ? 'توليد الإجابة النموذجية' : 'Générer le corrigé type',
    },
    overview: {
      specialization: language === 'ar' ? 'التخصص' : 'Spécialisation',
      trainingMode: language === 'ar' ? 'نمط التكوين' : 'Mode de formation',
      fullProgram: language === 'ar' ? 'البرنامج الكامل' : 'Programme Complet',
    },
    modules: {
      module: language === 'ar' ? 'المادة / الوحدة' : 'Module',
      code: language === 'ar' ? 'الرمز' : 'Code',
    },
    planner: {
      lesson: language === 'ar' ? 'الدرس' : 'Leçon',
      week: language === 'ar' ? 'الأسبوع' : 'Semaine',
    },
    lessonObjective: language === 'ar' ? 'هدف الدرس' : 'Objectif de la leçon',
    extra: {
      scenario: language === 'ar' ? 'وضعية مشكلة مهنية:' : 'Situation problème professionnelle :',
      exercise: language === 'ar' ? 'تمرين تطبيقي:' : 'Exercice pratique :',
      visual: language === 'ar' ? 'اقتراح بصري:' : 'Suggestion visuelle :',
      methodDetail: language === 'ar' ? 'تفاصيل الطريقة:' : 'Détails de la méthode :',
      criteria: language === 'ar' ? 'المعايير:' : 'Critères :',
      introduction: language === 'ar' ? 'تمهيد:' : 'Introduction :',
      professionalSituation: language === 'ar' ? 'وضعية مهنية:' : 'Situation Professionnelle :',
      teacherScript: language === 'ar' ? 'سيناريو الأستاذ الكامل:' : 'Teacher Full Script :',
      detailedConcepts: language === 'ar' ? 'شرح المفاهيم:' : 'Detailed Concepts :',
      practicalWork: language === 'ar' ? 'العمل التطبيقي (TP):' : 'Practical Work (TP) :',
      exercises: language === 'ar' ? 'تمارين:' : 'Exercises :',
      classroomInteraction: language === 'ar' ? 'تفاعل داخل القسم:' : 'Classroom Interaction :',
      lessonEvaluation: language === 'ar' ? 'تقييم الدرس:' : 'Lesson Evaluation :',
      summary: language === 'ar' ? 'خلاصة الدرس:' : 'Lesson Summary :',
      visualSupport: language === 'ar' ? 'الوسائل البصرية والبيداغوجية:' : 'Visual & Pedagogical Support :',
      examTypes: {
        comprehensive_1: language === 'ar' ? 'الامتحان الشامل (نموذج 1)' : 'Examen Complet (Modèle 1)',
        comprehensive_2: language === 'ar' ? 'الامتحان الشامل (نموذج 2)' : 'Examen Complet (Modèle 2)',
        remedial: language === 'ar' ? 'الامتحان الاستدراكي' : 'Examen de Rattrapage',
        control_1: language === 'ar' ? 'المراقبة المستمرة 01' : 'Contrôle Continu 01',
        control_2: language === 'ar' ? 'المراقبة المستمرة 02' : 'Contrôle Continu 02',
      },
      task: language === 'ar' ? 'المهمة:' : 'Task :',
      steps: language === 'ar' ? 'خطوات التنفيذ:' : 'Execution Steps :',
      tools: language === 'ar' ? 'الأدوات:' : 'Tools :',
      safety: language === 'ar' ? 'احتياطات السلامة:' : 'Safety Precautions :',
      questions: language === 'ar' ? 'الأسئلة:' : 'Questions :',
      solutions: language === 'ar' ? 'الحلول:' : 'Solutions :',
      detailedCorrection: language === 'ar' ? 'تصحيح مفصل:' : 'Detailed Correction :',
      diagrams: language === 'ar' ? 'مخططات:' : 'Diagrams :',
      symbols: language === 'ar' ? 'رموز:' : 'Symbols :',
      pedagogicalMedia: language === 'ar' ? 'وسائل تعليمية:' : 'Pedagogical Media :',
      practicalTasks: language === 'ar' ? 'مهام تطبيقية:' : 'Practical Tasks :',
      analysis: language === 'ar' ? 'تحليل:' : 'Analyse :',
      coreConcepts: language === 'ar' ? 'المفاهيم الأساسية:' : 'Concepts clés :',
      practicalWorkflow: language === 'ar' ? 'سير العمل التطبيقي:' : 'Déroulement pratique :',
      algerianExamples: language === 'ar' ? 'أمثلة جزائرية:' : 'Exemples algériens :',
      realLifeVisuals: language === 'ar' ? 'صور واقعية:' : 'Visuels réels :',
      aiImagePrompt: language === 'ar' ? 'موجه صورة الذكاء الاصطناعي:' : 'AI Image Generation Prompt:',
      lessonExam: language === 'ar' ? 'امتحان الدرس:' : 'Examen du cours :',
      moduleExam: language === 'ar' ? 'امتحان نهاية الوحدة:' : 'Examen de fin de module :',
      alternanceSchedule: language === 'ar' ? 'مخطط التناوب (مركز / مؤسسة)' : 'Planning d\'alternance (Centre / Entreprise)',
      fttc: language === 'ar' ? 'المركز (FTTC)' : 'Centre (FTTC)',
      enterprise: language === 'ar' ? 'المؤسسة (Entreprise)' : 'Entreprise',
      intermediateObjectives: language === 'ar' ? 'الأهداف الوسيطية:' : 'Objectifs Intermédiaires :',
      contentElements: language === 'ar' ? 'عناصر المحتوى:' : 'Éléments de Contenu :',
      evaluationCriteria: language === 'ar' ? 'معايير الأداء والتقويم:' : 'Critères de Performance & Évaluation :',
      suggestedTest: language === 'ar' ? 'مقترح اختبار (Exam):' : 'Test Suggéré (Exam) :',
      location: language === 'ar' ? 'المكان:' : 'Lieu :',
      lessonType: language === 'ar' ? 'نوع الدرس:' : 'Type de leçon :',
      theory: language === 'ar' ? 'نظري' : 'Théorie',
      practical: language === 'ar' ? 'تطبيقي' : 'Pratique',
      subSituations: language === 'ar' ? 'الوضعيات التعلمية الجزئية:' : 'Sous-situations d\'apprentissage :',
      teacherName: language === 'ar' ? 'اسم الأستاذ' : 'Nom du formateur',
      centerName: language === 'ar' ? 'اسم المركز / المؤسسة' : 'Nom du centre / Établissement',
      edit: language === 'ar' ? 'تعديل' : 'Modifier',
      save: language === 'ar' ? 'حفظ' : 'Enregistrer',
      downloadWord: language === 'ar' ? 'تحميل Word' : 'Télécharger Word',
      downloadPdf: language === 'ar' ? 'تحميل PDF' : 'Télécharger PDF',
    }
  };

  const institutionName = centerName || (language === 'ar' ? 'مركز التكوين المهني والتمهين' : 'Centre de Formation Professionnelle');

  const createHeading = (text: string, level: any, size: number = 24) => {
    const isRtl = language === 'ar';
    return new Paragraph({
      bidirectional: isRtl,
      alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      heading: level,
      children: [
        new TextRun({
          text: text,
          bold: true,
          size: size,
        }),
      ],
    });
  };

  const exportToWord = async () => {
    if (!currentData || !currentData.semesters || selectedSemester === null || selectedModule === null || selectedLessonIdx === null) return;
    const semester = currentData.semesters.find(s => s.id === selectedSemester);
    const module = semester?.modules[selectedModule];
    if (!module) return;

    const lessonSkeleton = module.lessons[selectedLessonIdx];
    const lessonKey = `${module.name}-${lessonSkeleton.week}-${language}-${trainingMode}`;
    const lessonDetails = fullLessons[lessonKey];

    if (!lessonDetails) return;

    const isRtl = language === 'ar';

    const createParagraph = (text: string, options: { bold?: boolean, size?: number, color?: string, italics?: boolean, heading?: any, indent?: any } = {}) => {
      return new Paragraph({
        bidirectional: isRtl,
        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        heading: options.heading,
        indent: options.indent,
        children: [
          new TextRun({
            text,
            bold: options.bold,
            size: options.size,
            color: options.color,
            italics: options.italics,
          })
        ],
      });
    };

    const createHeading = (text: string, level: any, size: number = 28) => {
      return new Paragraph({
        bidirectional: isRtl,
        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        heading: level,
        children: [new TextRun({ text, bold: true, size })],
      });
    };

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children: [
          // Professional Header Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "الجمهورية الجزائرية الديمقراطية الشعبية", bold: true, size: 24 }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "وزارة التكوين والتعليم المهنيين", bold: true, size: 20 }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: institutionName || "مركز التكوين المهني والتمهين", bold: true, size: 18 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          
          // Title Box
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: "F3F4F6" },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: t.tabs.lessonPlan, bold: true, size: 32 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),

          // Info Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.overview.specialization + ": ", bold: true }),
                          new TextRun({ text: currentData?.[language]?.specializationName || '' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.overview.trainingMode + ": ", bold: true }),
                          new TextRun({ text: t.overview[trainingMode] }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.modules.module + ": ", bold: true }),
                          new TextRun({ text: module?.name || '' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.modules.code + ": ", bold: true }),
                          new TextRun({ text: module?.id || '' }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.planner.lesson + ": ", bold: true }),
                          new TextRun({ text: lessonSkeleton?.title || '' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.planner.week + ": ", bold: true }),
                          new TextRun({ text: String(lessonSkeleton?.week || '') }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),

          createHeading(t.lessonObjective, HeadingLevel.HEADING_2, 24),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: lessonSkeleton?.practicalObjective || '' })],
          }),
          new Paragraph({ text: "" }),

          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              new TextRun({ text: t.table.teachingMaterials + ": ", bold: true }), 
              new TextRun({ text: lessonSkeleton?.materials?.join(', ') || '' })
            ],
          }),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              new TextRun({ text: t.table.prerequisites + ": ", bold: true }), 
              new TextRun({ text: lessonSkeleton?.prerequisites?.join(', ') || '' })
            ],
          }),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              new TextRun({ text: t.table.teachingMaterials + ": ", bold: true }), 
              new TextRun({ text: lessonSkeleton?.materials?.join(', ') || '' })
            ],
          }),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              new TextRun({ text: t.extra.location + ": ", bold: true }), 
              new TextRun({ text: lessonSkeleton?.location === 'EFP' ? t.extra.fttc : t.extra.enterprise })
            ],
          }),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              new TextRun({ text: t.extra.lessonType + ": ", bold: true }), 
              new TextRun({ text: lessonSkeleton?.type === 'theory' ? t.extra.theory : t.extra.practical })
            ],
          }),
          new Paragraph({ text: "" }),
          createHeading("A. PEDAGOGICAL SHEET", HeadingLevel.HEADING_2, 24),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.phase, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.content, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.methods, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.duration, bold: true })] })] }),
                ],
              }),
              ...(lessonDetails?.phasesTable?.map(p => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: p.phase })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: p.content })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: p.method })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: p.duration })] })] }),
                ],
              })) || []),
            ],
          }),
          new Paragraph({ text: "" }),
          ...(trainingMode === 'alternance' ? [
            createHeading(t.extra.alternanceSchedule, HeadingLevel.HEADING_2, 24),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu'].map(day => 
                    new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: day, bold: true })] })] })
                  )
                }),
                new TableRow({
                  children: [0, 1, 2, 3, 4].map(di => 
                    new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: di < 2 ? t.extra.fttc : t.extra.enterprise })] })] })
                  )
                })
              ]
            }),
            new Paragraph({ text: "" })
          ] : []),
          createHeading("B. APC PEDAGOGICAL CARD", HeadingLevel.HEADING_2, 24),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.phase, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.teacherActivity, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.traineeActivity, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.materials, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.duration, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.table.evaluation, bold: true })] })] }),
                ],
              }),
              ...(lessonDetails?.apcTable?.map(a => new TableRow({
                children: [
                  new TableCell({ children: [
                    new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: a.phase, bold: true })] }),
                    ...(a.subSituations?.map(sub => new Paragraph({ 
                      bidirectional: isRtl,
                      alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                      children: [new TextRun({ text: `• ${sub}`, size: 16 })],
                      indent: { left: 360 } 
                    })) || [])
                  ] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: a.teacherActivity })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: a.traineeActivity })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: a.materials })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: a.duration })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: a.evaluation })] })] }),
                ],
              })) || []),
            ],
          }),
          new Paragraph({ text: "" }),
          createHeading("C. DETAILED LESSON CONTENT", HeadingLevel.HEADING_2, 24),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.introduction + ": ", bold: true }), new TextRun({ text: lessonDetails?.introduction || '' })]
          }),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.professionalSituation + ": ", bold: true }), new TextRun({ text: lessonDetails?.professionalSituation || '' })]
          }),
          new Paragraph({ text: "" }),
          createHeading(language === 'ar' ? 'المنهجية المتبعة' : 'Pedagogical Methodology', HeadingLevel.HEADING_3, 20),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: lessonDetails?.methodology || '', italics: true })]
          }),
          new Paragraph({ text: "" }),
          createHeading(t.extra.teacherScript, HeadingLevel.HEADING_3, 20),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: lessonDetails?.teacherScript || '', italics: true })]
          }),
          new Paragraph({ text: "" }),
          createHeading(t.extra.detailedConcepts, HeadingLevel.HEADING_3, 20),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: lessonDetails?.detailedConcepts || '' })]
          }),
          new Paragraph({ text: "" }),
          ...(lessonDetails?.algerianExamples && lessonDetails.algerianExamples.length > 0 ? [
            createHeading(t.extra.algerianExamples, HeadingLevel.HEADING_3, 20),
            ...(lessonDetails?.algerianExamples?.map(ex => new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `• ${ex}`, italics: true })], 
              indent: { left: 720 } 
            })) || []),
            new Paragraph({ text: "" })
          ] : []),
          createHeading(t.extra.practicalWork, HeadingLevel.HEADING_3, 20),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.task + ": ", bold: true }), new TextRun({ text: lessonDetails?.practicalWork?.task || '' })]
          }),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.steps + ":", bold: true })]
          }),
          ...(lessonDetails?.practicalWork?.steps?.map(step => new Paragraph({ 
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: `- ${step}` })], 
            indent: { left: 720 } 
          })) || []),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.tools + ":", bold: true })]
          }),
          ...(lessonDetails?.practicalWork?.tools?.map(tool => new Paragraph({ 
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: `- ${tool}` })], 
            indent: { left: 720 } 
          })) || []),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.safety + ":", bold: true, color: "FF0000" })]
          }),
          ...(lessonDetails?.practicalWork?.safety?.map(s => new Paragraph({ 
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: `! ${s}` })], 
            indent: { left: 720 } 
          })) || []),
          new Paragraph({ text: "" }),
          createHeading(t.extra.summary, HeadingLevel.HEADING_3, 20),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: lessonDetails?.summary || '' })]
          }),
          new Paragraph({ text: "" }),
          createHeading("D. VISUAL & PEDAGOGICAL SUPPORT", HeadingLevel.HEADING_2, 24),
          ...(lessonDetails?.visualSupport?.visuals?.flatMap((v, i) => [
            createHeading(`${i + 1}. ${v.title} (${v.type})`, HeadingLevel.HEADING_3, 20),
            new Paragraph({
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: v.description })]
            }),
            new Paragraph({
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: t.extra.aiImagePrompt + ": ", bold: true, size: 16, color: "4F46E5" }), new TextRun({ text: v.aiPrompt, italics: true, color: "6B7280" })]
            }),
            new Paragraph({ text: "" })
          ]) || []),
          new Paragraph({ text: "" }),
          createHeading("E. INTERACTION & EVALUATION", HeadingLevel.HEADING_2, 24),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.classroomInteraction + ": ", bold: true }), new TextRun({ text: lessonDetails?.classroomInteraction || '' })]
          }),
          new Paragraph({ text: "" }),
          createHeading(t.extra.exercises, HeadingLevel.HEADING_3, 20),
          ...(lessonDetails?.exercises?.flatMap((ex, i) => [
            new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `${i + 1}. ${ex.question} (${ex.difficulty})`, bold: true })], 
              indent: { left: 720 } 
            }),
            new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `${t.extra.solutions}: ${ex.solution}`, italics: true })], 
              indent: { left: 1080 } 
            })
          ]) || []),
          new Paragraph({ text: "" }),
          createHeading(t.extra.lessonEvaluation, HeadingLevel.HEADING_3, 20),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.questions + ":", bold: true })]
          }),
          ...(lessonDetails?.lessonEvaluation?.questions?.map(q => new Paragraph({ 
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: `? ${q}` })], 
            indent: { left: 720 } 
          })) || []),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.practicalTasks + ":", bold: true })]
          }),
          ...(lessonDetails?.lessonEvaluation?.practicalTasks?.map(pt => new Paragraph({ 
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: `* ${pt}` })], 
            indent: { left: 720 } 
          })) || []),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: t.extra.detailedCorrection + ":", bold: true })]
          }),
          new Paragraph({ 
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: lessonDetails?.lessonEvaluation?.detailedCorrection || '' })], 
            indent: { left: 720 } 
          }),
          new Paragraph({ text: "" }),
          ...(lessonDetails?.suggestedTest ? [
            createHeading(t.extra.suggestedTest, HeadingLevel.HEADING_2, 24),
            createHeading(lessonDetails.suggestedTest.title, HeadingLevel.HEADING_3, 20),
            new Paragraph({
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: t.extra.questions + ":", bold: true })]
            }),
            ...(lessonDetails.suggestedTest.questions.map(q => new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `Q: ${q}` })], 
              indent: { left: 720 } 
            }))),
            new Paragraph({
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: t.extra.solutions + ":", bold: true, color: "10B981" })]
            }),
            ...(lessonDetails.suggestedTest.solutions.map(s => new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `A: ${s}`, italics: true })], 
              indent: { left: 720 } 
            }))),
          ] : []),
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${lessonSkeleton?.title || 'Lesson'}_APC_Lesson.docx`);
  };

  const exportModuleToWord = async () => {
    if (!currentData || !currentData.semesters || selectedSemester === null || selectedModule === null) return;
    const semester = currentData.semesters.find(s => s.id === selectedSemester);
    const module = semester?.modules[selectedModule];
    if (!module) return;

    const isRtl = language === 'ar';

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
            size: { orientation: 'landscape' as any }
          },
        },
        children: [
          // Professional Header Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "الجمهورية الجزائرية الديمقراطية الشعبية", bold: true, size: 24 }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "وزارة التكوين والتعليم المهنيين", bold: true, size: 20 }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: institutionName || "مركز التكوين المهني والتمهين", bold: true, size: 18 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          
          // Title Box
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: "F3F4F6" },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: t.tabs.modulePlan, bold: true, size: 32 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),

          // Info Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.overview.specialization + ": ", bold: true }),
                          new TextRun({ text: currentData?.[language]?.specializationName || '' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.overview.trainingMode + ": ", bold: true }),
                          new TextRun({ text: t.overview[trainingMode] }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.modules.module + ": ", bold: true }),
                          new TextRun({ text: module?.name || '' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.modules.code + ": ", bold: true }),
                          new TextRun({ text: module?.id || '' }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),

          createHeading(t.generalObjective, HeadingLevel.HEADING_2, 24),
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: module.generalObjective })]
          }),
          new Paragraph({ text: "" }),
          ...(module.intermediateObjectives && module.intermediateObjectives.length > 0 ? [
            createHeading(t.extra.intermediateObjectives, HeadingLevel.HEADING_3, 20),
            ...(module.intermediateObjectives?.map(obj => new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `• ${obj}` })], 
              indent: { left: 720 } 
            })) || []),
            new Paragraph({ text: "" })
          ] : []),
          ...(module.contentElements && module.contentElements.length > 0 ? [
            createHeading(t.extra.contentElements, HeadingLevel.HEADING_3, 20),
            ...(module.contentElements?.map(el => new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `• ${el}` })], 
              indent: { left: 720 } 
            })) || []),
            new Paragraph({ text: "" })
          ] : []),
          ...(module.evaluationCriteria && module.evaluationCriteria.length > 0 ? [
            createHeading(t.extra.evaluationCriteria, HeadingLevel.HEADING_3, 20),
            ...(module.evaluationCriteria?.map(crit => new Paragraph({ 
              bidirectional: isRtl,
              alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: `• ${crit}` })], 
              indent: { left: 720 } 
            })) || []),
            new Paragraph({ text: "" })
          ] : []),
          createHeading(t.tabs.planner, HeadingLevel.HEADING_2, 24),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.week, bold: true })] })] }),
                  ...(trainingMode === 'alternance' ? [
                    new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Mode", bold: true })] })] })
                  ] : []),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.title, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.practicalObjective, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.teachingMaterials, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.evaluation, bold: true })] })] }),
                ]
              }),
              ...(module?.lessons?.map((l, idx) => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.week.toString() })] })] }),
                  ...(trainingMode === 'alternance' ? [
                    new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.location === 'EFP' ? 'FTTC' : 'ENT' })] })] })
                  ] : []),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.title })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.practicalObjective })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.materials?.join(', ') || '' })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.evaluation })] })] }),
                ]
              })) || [])
            ]
          }),
          ...(trainingMode === 'alternance' ? [
            new Paragraph({ text: "" }),
            new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: t.extra.alternanceSchedule, bold: true, size: 24 })] }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: (isRtl ? ['Jeu', 'Mer', 'Mar', 'Lun', 'Dim'] : ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu']).map(day => 
                    new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: day, bold: true })] })] })
                  )
                }),
                new TableRow({
                  children: (isRtl ? [4, 3, 2, 1, 0] : [0, 1, 2, 3, 4]).map(di => 
                    new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: di < 2 ? t.extra.fttc : t.extra.enterprise })] })] })
                  )
                })
              ]
            })
          ] : [])
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${module.name}_Full_Planning.docx`);
  };

  const exportFullProgramToWord = async () => {
    if (!currentData || !currentData.semesters) return;
    const isRtl = language === 'ar';

    const sections = currentData.semesters.flatMap(sem => 
      sem.modules?.map(mod => ({
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
            size: { orientation: 'landscape' as any }
          }
        },
        children: [
          // Professional Header Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "الجمهورية الجزائرية الديمقراطية الشعبية", bold: true, size: 24 }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: "وزارة التكوين والتعليم المهنيين", bold: true, size: 20 }),
                        ],
                      }),
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: institutionName || "مركز التكوين المهني والتمهين", bold: true, size: 18 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),

          // Title Box: مخطط المقياس
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { fill: "F3F4F6" },
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                          new TextRun({ text: language === 'ar' ? "مخطط المقياس" : "Plan du Module", bold: true, size: 28 }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),

          // Info Table (Specialization, Mode, Module, Code)
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.overview.specialization + ": ", bold: true }),
                          new TextRun({ text: currentData?.[language]?.specializationName || '' }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.overview.trainingMode + ": ", bold: true }),
                          new TextRun({ text: t.overview[trainingMode] }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: (language === 'ar' ? "المادة / الوحدة: " : "Module: "), bold: true }),
                          new TextRun({ text: mod.name }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        bidirectional: isRtl,
                        alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
                        children: [
                          new TextRun({ text: t.modules.code + ": ", bold: true }),
                          new TextRun({ text: mod.id }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: "" }),

          // General Objective
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [
              new TextRun({ text: t.generalObjective + ": ", bold: true, color: "3B82F6" }),
              new TextRun({ text: mod.generalObjective, color: "3B82F6" })
            ]
          }),
          new Paragraph({ text: "" }),

          // Lesson Display Table
          new Paragraph({
            bidirectional: isRtl,
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            children: [new TextRun({ text: language === 'ar' ? "عرض الدروس" : "Affichage des Leçons", bold: true, size: 24, color: "3B82F6" })]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.week, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.title, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.practicalObjective, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.teachingMaterials, bold: true })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: t.table.evaluation, bold: true })] })] }),
                ]
              }),
              ...(mod?.lessons?.map((l) => new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: AlignmentType.CENTER, children: [new TextRun({ text: l.week.toString() })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.title })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.practicalObjective })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.materials?.join(', ') || '' })] })] }),
                  new TableCell({ children: [new Paragraph({ bidirectional: isRtl, alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: l.evaluation })] })] }),
                ]
              })) || [])
            ]
          }),
        ]
      }))
    );

    const doc = new Document({
      sections: sections as any
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${currentData?.[language]?.specializationName || 'Program'}_Full_Modules.docx`);
  };

  const exportFullProgramToPDF = async () => {
    if (!currentData || !currentData.semesters) return;
    
    const pdf = new jsPDF('l', 'mm', 'a4');
    const isRtl = language === 'ar';
    
    // We'll use a hidden container to render each module and capture it
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '297mm'; // A4 Landscape width
    container.style.backgroundColor = 'white';
    container.style.color = 'black';
    container.style.padding = '10mm';
    document.body.appendChild(container);

    try {
      let firstPage = true;
      
      for (const sem of currentData.semesters) {
        if (!sem.modules) continue;
        for (const mod of sem.modules) {
          if (!firstPage) pdf.addPage('a4', 'l');
          
          // Render module content to the hidden container
          container.innerHTML = `
            <div style="direction: ${isRtl ? 'rtl' : 'ltr'}; font-family: sans-serif; padding: 20px;">
              <div style="text-align: center; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 18px;">الجمهورية الجزائرية الديمقراطية الشعبية</h2>
                <h3 style="margin: 5px 0; font-size: 16px;">وزارة التكوين والتعليم المهنيين</h3>
                <h4 style="margin: 0; font-size: 14px;">${institutionName || "مركز التكوين المهني والتمهين"}</h4>
              </div>
              
              <div style="background-color: #f3f4f6; padding: 10px; text-align: center; margin-bottom: 20px; border: 1px solid #d1d5db;">
                <h1 style="margin: 0; font-size: 22px;">${language === 'ar' ? "مخطط المقياس" : "Plan du Module"}</h1>
              </div>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>${t.overview.specialization}:</strong> ${currentData?.[language]?.specializationName || ''}</td>
                  <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>${t.overview.trainingMode}:</strong> ${t.overview[trainingMode]}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>${language === 'ar' ? "المادة / الوحدة: " : "Module: "}:</strong> ${mod.name}</td>
                  <td style="padding: 8px; border: 1px solid #d1d5db;"><strong>${t.modules.code}:</strong> ${mod.id}</td>
                </tr>
              </table>
              
              <div style="margin-bottom: 20px;">
                <h3 style="color: #3b82f6; margin-bottom: 5px;">${t.generalObjective}:</h3>
                <p style="margin: 0;">${mod.generalObjective}</p>
              </div>
              
              <h3 style="color: #3b82f6; margin-bottom: 10px;">${language === 'ar' ? "عرض الدروس" : "Affichage des Leçons"}</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background-color: #f3f4f6;">
                    <th style="border: 1px solid #d1d5db; padding: 6px;">${t.table.week}</th>
                    <th style="border: 1px solid #d1d5db; padding: 6px;">${t.table.title}</th>
                    <th style="border: 1px solid #d1d5db; padding: 6px;">${t.table.practicalObjective}</th>
                    <th style="border: 1px solid #d1d5db; padding: 6px;">${t.table.teachingMaterials}</th>
                    <th style="border: 1px solid #d1d5db; padding: 6px;">${t.table.evaluation}</th>
                  </tr>
                </thead>
                <tbody>
                  ${mod.lessons?.map(l => `
                    <tr>
                      <td style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">${l.week}</td>
                      <td style="border: 1px solid #d1d5db; padding: 6px;">${l.title}</td>
                      <td style="border: 1px solid #d1d5db; padding: 6px;">${l.practicalObjective}</td>
                      <td style="border: 1px solid #d1d5db; padding: 6px;">${l.materials?.join(', ') || ''}</td>
                      <td style="border: 1px solid #d1d5db; padding: 6px;">${l.evaluation}</td>
                    </tr>
                  `).join('') || ''}
                </tbody>
              </table>
            </div>
          `;
          
          const canvas = await html2canvas(container, { scale: 2 });
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', 0, 0, 297, 210);
          firstPage = false;
        }
      }
      
      pdf.save(`${currentData?.[language]?.specializationName || 'Program'}_Full_Modules.pdf`);
    } catch (err) {
      console.error("Full PDF Export failed:", err);
      setError(language === 'ar' ? 'فشل تصدير ملف PDF' : 'Échec de l\'exportation PDF');
    } finally {
      document.body.removeChild(container);
    }
  };

  const exportToPDF = async () => {
    if (!currentData || !currentData.semesters || selectedSemester === null || selectedModule === null) return;
    const semester = currentData.semesters.find(s => s.id === selectedSemester);
    const module = semester?.modules[selectedModule];
    if (!module) return;

    // If we are in a detailed tab, we use html2canvas for high fidelity
    if (['generator', 'content', 'visuals', 'exams', 'lessonPlan', 'modulePlan', 'moduleExam', 'modelAnswer', 'overview'].includes(activeTab)) {
      const element = document.getElementById('lesson-content-area') || 
                      document.getElementById('planner-content-area') || 
                      document.getElementById('overview-content-area') ||
                      document.getElementById('lesson-plan-area') ||
                      document.getElementById('module-plan-area') ||
                      document.getElementById('module-exam-area') ||
                      document.getElementById('model-answer-area');
      
      if (element) {
        try {
          const orientation = activeTab === 'modulePlan' ? 'l' : 'p';
          const canvas = await html2canvas(element as HTMLElement, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
            onclone: (clonedDoc) => {
              const el = clonedDoc.getElementById(element.id);
              if (el) {
                el.style.color = 'black';
                el.style.backgroundColor = 'white';
                el.style.padding = '0';
                el.style.margin = '0';
                el.style.maxHeight = 'none';
                el.style.overflow = 'visible';
                el.style.borderRadius = '0';
                el.style.boxShadow = 'none';
                el.style.border = 'none';
                el.style.width = orientation === 'p' ? '210mm' : '297mm';
                
                el.querySelectorAll('*').forEach((child: any) => {
                  child.style.color = 'black';
                  child.style.boxShadow = 'none';
                  child.style.borderRadius = '0';
                  if (!child.classList.contains('bg-yellow-500') && !child.classList.contains('bg-yellow-600')) {
                    const hasBg = child.className.includes('bg-');
                    if (!hasBg) {
                      child.style.backgroundColor = 'transparent';
                    }
                  }
                });
                // Hide elements that shouldn't be in PDF
                el.querySelectorAll('.no-print').forEach((child: any) => {
                  child.style.display = 'none';
                });
              }
            }
          });

          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF(orientation, 'mm', 'a4');
          const imgProps = pdf.getImageProperties(imgData);
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
          
          const pageHeight = pdf.internal.pageSize.getHeight();
          let heightLeft = pdfHeight;
          const margin = 0.27; // 0.27 mm margin as requested
          let position = margin;

          // First page
          pdf.addImage(imgData, 'PNG', margin, position, pdfWidth - (margin * 2), pdfHeight, undefined, 'FAST');
          heightLeft -= pageHeight;

          // Subsequent pages
          let pageCount = 1;
          while (heightLeft > 0) {
            position = -(pageHeight * pageCount) + margin;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', margin, position, pdfWidth - (margin * 2), pdfHeight, undefined, 'FAST');
            heightLeft -= pageHeight;
            pageCount++;
          }

          pdf.save(`${module.name}_${activeTab}.pdf`);
          return;
        } catch (err) {
          console.error("PDF Export failed:", err);
          // Fallback to basic text PDF if html2canvas fails
          const doc = new jsPDF();
          doc.setFontSize(12);
          doc.text(`Export: ${module.name} - ${activeTab}`, 10, 10);
          doc.save(`${module.name}_${activeTab}.pdf`);
          return;
        }
      }
    }

    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(18);
    doc.text(`${semester?.title} - ${module.name}`, 148, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`${t.volume} ${module.hourlyVolume}`, 148, 30, { align: 'center' });

    const head = [
      t.table.week,
      ...(trainingMode === 'alternance' ? ['Mode'] : []),
      t.table.title,
      t.table.practicalObjective,
      t.table.teachingMaterials,
      t.table.evaluation
    ];

    const body = module?.lessons?.map((l, idx) => [
      l.week,
      ...(trainingMode === 'alternance' ? [l.location === 'EFP' ? 'FTTC' : 'ENT'] : []),
      l.title,
      l.practicalObjective,
      l.materials?.join(', ') || '',
      l.evaluation
    ]) || [];

    autoTable(doc, {
      startY: 40,
      head: [head],
      body: body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [28, 25, 23] },
    });

    doc.save(`${module.name}_APC_Planning.pdf`);
  };

  const renderTabContent = () => {
    if (!currentData || !currentData.semesters) return null;
    const semester = currentData.semesters.find(s => s.id === selectedSemester);
    const module: ModuleSkeleton | undefined = semester?.modules[selectedModule ?? 0];

    switch (activeTab) {
      case 'overview':
        return (
          <div id="overview-content-area" className="space-y-8">
            <div className="bg-white/[0.03] backdrop-blur-3xl rounded-[4rem] border border-white/5 p-10 sm:p-16 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-[120px] -mr-48 -mt-48" />
              <div className="relative z-10 flex flex-col md:flex-row gap-16 items-start">
                <div className="w-full md:w-1/3 space-y-8">
                  <div className="p-10 bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 rounded-[3.5rem] shadow-[0_20px_50px_-12px_rgba(245,158,11,0.3)] flex items-center justify-center group">
                    <BookOpen className="w-24 h-24 text-black transition-transform group-hover:scale-110 duration-500" />
                  </div>

                  <div className="p-8 bg-white/[0.03] rounded-[3rem] border border-white/5 space-y-6 no-print backdrop-blur-xl">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 mb-2 flex items-center gap-3">
                      <div className="w-4 h-[1px] bg-amber-500/30" /> {language === 'ar' ? 'إعدادات المكون' : 'Paramètres du formateur'}
                    </h4>
                    <div className="space-y-5">
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-2 block">{t.extra.teacherName}</label>
                        <input 
                          type="text"
                          value={teacherName}
                          onChange={(e) => setTeacherName(e.target.value)}
                          placeholder={language === 'ar' ? 'أدخل اسمك هنا' : 'Votre nom ici'}
                          className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-5 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all placeholder:text-gray-600"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-2 block">{t.extra.centerName}</label>
                        <input 
                          type="text"
                          value={centerName}
                          onChange={(e) => setCenterName(e.target.value)}
                          placeholder={language === 'ar' ? 'اسم المؤسسة' : 'Nom de l\'établissement'}
                          className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-5 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all placeholder:text-gray-600"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 text-center md:text-start">
                    <h3 className="text-4xl font-black uppercase tracking-tighter text-white leading-none">{currentData.specializationName}</h3>
                    <div className="inline-flex px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                      <p className="text-amber-500 font-black tracking-[0.2em] uppercase text-[10px]">{currentData.edition}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4 no-print">
                    <button 
                      onClick={exportFullProgramToWord}
                      className="w-full flex items-center justify-center gap-4 py-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <FileDown className="w-5 h-5" />
                      {t.downloadFullProgram} (DOC)
                    </button>
                    <button 
                      onClick={exportFullProgramToPDF}
                      className="w-full flex items-center justify-center gap-4 py-5 bg-white/[0.05] border border-white/10 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-white/[0.08] transition-all"
                    >
                      <Printer className="w-5 h-5 text-amber-500" />
                      {t.downloadFullProgram} (PDF)
                    </button>
                  </div>
                </div>
                <div className="w-full md:w-2/3 space-y-8">
                  <section className="p-8 bg-white/[0.03] rounded-[3rem] border border-white/5 backdrop-blur-xl">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 mb-6 flex items-center gap-3">
                      <div className="w-4 h-[1px] bg-amber-500/30" /> {t.specialtyCard}
                    </h4>
                    <p className="text-gray-300 leading-relaxed text-lg mb-10 font-medium">{currentData.description}</p>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
                      <div className="p-6 bg-white/[0.05] rounded-3xl border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t.trainingModeLabel}</p>
                        <p className="text-xl font-black text-amber-500 uppercase">{t.modes[trainingMode].title}</p>
                      </div>
                      <div className="p-6 bg-white/[0.05] rounded-3xl border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t.totalDuration}</p>
                        <p className="text-xl font-black text-white">{currentData.totalHours} {t.hours}</p>
                      </div>
                      <div className="p-6 bg-white/[0.05] rounded-3xl border border-white/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t.edition}</p>
                        <p className="text-xl font-black text-white">{currentData.edition}</p>
                      </div>
                    </div>
                  </section>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Semestres</p>
                      <p className="text-2xl font-black text-white">{currentData?.semesters?.length || 0}</p>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Modules</p>
                      <p className="text-2xl font-black text-white">
                        {currentData?.semesters?.reduce((acc, s) => acc + (s.modules?.length || 0), 0) || 0}
                      </p>
                    </div>
                    <div className="p-6 bg-white/5 rounded-3xl border border-white/10 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Lessons</p>
                      <p className="text-2xl font-black text-white">
                        {currentData?.semesters?.reduce((acc, s) => acc + (s.modules?.reduce((ma, m) => ma + (m.lessons?.length || 0), 0) || 0), 0) || 0}
                      </p>
                    </div>
                  </div>

                  {trainingMode === 'alternance' && (
                    <section className="mt-12 p-8 bg-indigo-500/5 rounded-[2.5rem] border border-indigo-500/20">
                      <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-6 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" /> {t.extra.alternanceSchedule}
                      </h4>
                      <div className="grid grid-cols-5 gap-4">
                        {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu'].map((day, di) => (
                          <div key={day} className="text-center">
                            <p className="text-[10px] font-bold text-gray-500 mb-2 uppercase">{day}</p>
                            <div className={`p-4 rounded-2xl border text-[10px] font-black uppercase tracking-tighter ${
                              di < 2 ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                            }`}>
                              {di < 2 ? t.extra.fttc : t.extra.enterprise}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-6 text-xs text-gray-500 italic">
                        {language === 'ar' 
                          ? '* هذا المخطط نموذجي للتكوين بالتناوب: يومين في المركز و 3 أيام في المؤسسة.' 
                          : '* Ce planning est typique pour la formation en alternance : 2 jours au centre et 3 jours en entreprise.'}
                      </p>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      case 'modules':
        return (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/5 backdrop-blur-xl rounded-[2.5rem] border border-white/10 p-8 shadow-2xl">
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                  {language === 'ar' ? 'وحدات التكوين' : 'Modules de Formation'}
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {language === 'ar' ? 'عرض وتحميل جميع وحدات البرنامج' : 'Afficher et télécharger tous les modules du programme'}
                </p>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={exportFullProgramToWord}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-500/20"
                >
                  <FileText className="w-5 h-5" />
                  DOC
                </button>
                <button 
                  onClick={exportFullProgramToPDF}
                  className="flex items-center gap-2 px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-rose-500/20"
                >
                  <FileDown className="w-5 h-5" />
                  PDF
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {currentData?.semesters?.map((sem) => (
              <div key={sem.id} className="bg-white/[0.03] backdrop-blur-3xl rounded-[3.5rem] border border-white/5 p-10 shadow-2xl">
                <div className="flex items-center gap-5 mb-10">
                  <div className="p-4 bg-blue-500/10 rounded-2xl">
                    <LayoutGrid className="w-7 h-7 text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-white">{sem.title}</h3>
                </div>
                <div className="space-y-6">
                  {sem.modules?.map((mod, idx) => (
                    <div 
                      key={idx}
                      className="p-8 bg-white/[0.03] rounded-[2.5rem] border border-white/5 hover:border-amber-500/30 hover:bg-white/[0.07] transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-3xl -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="flex justify-between items-start mb-6 relative z-10">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 font-black text-lg border border-amber-500/20">
                            {mod.id}
                          </div>
                          <div>
                            <p className="font-black text-white text-xl tracking-tight">{mod.name}</p>
                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mt-1">{t.weeklyHours} {mod.weeklyHours}</p>
                            {trainingMode === 'alternance' && (
                              <div className="flex gap-4 mt-2">
                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest px-2 py-0.5 bg-indigo-500/10 rounded-md border border-indigo-500/20">EFP: {mod.efpHours}</p>
                                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">ENT: {mod.enterpriseHours}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setSelectedSemester(sem.id);
                            setSelectedModule(idx);
                            setActiveTab('planner');
                          }}
                          className="p-4 bg-amber-500 rounded-[1.5rem] text-black hover:scale-110 active:scale-95 transition-all shadow-xl shadow-amber-500/20"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      </div>
                      
                      <div className="space-y-6 mt-8 pt-8 border-t border-white/5 relative z-10">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500/60 mb-3">{t.generalObjective}</p>
                          <p className="text-sm text-gray-400 leading-relaxed font-medium">{mod.generalObjective}</p>
                        </div>
                        
                        {mod.intermediateObjectives && mod.intermediateObjectives.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-2">{t.extra.intermediateObjectives}</p>
                            <ul className="space-y-1">
                              {(mod.intermediateObjectives || []).map((obj, oi) => (
                                <li key={oi} className="text-xs text-gray-400 flex items-start gap-2">
                                  <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5" />
                                  <span>{obj}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {mod.contentElements && mod.contentElements.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">{t.extra.contentElements}</p>
                            <div className="flex flex-wrap gap-2">
                              {(mod.contentElements || []).map((el, ei) => (
                                <span key={ei} className="px-2 py-0.5 bg-emerald-500/5 border border-emerald-500/10 rounded text-[10px] text-emerald-300/70">
                                  {el}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {mod.evaluationCriteria && mod.evaluationCriteria.length > 0 && (
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mb-2">{t.extra.evaluationCriteria}</p>
                            <ul className="space-y-1">
                              {(mod.evaluationCriteria || []).map((crit, ci) => (
                                <li key={ci} className="text-xs text-gray-400 flex items-start gap-2">
                                  <div className="w-1 h-1 bg-rose-500 rounded-full mt-1.5" />
                                  <span>{crit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{t.competencies}</p>
                          <div className="flex flex-wrap gap-2">
                            {mod.competencies?.map((c, ci) => (
                              <span key={ci} className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] text-gray-400 font-medium">
                                {c}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
      case 'planner':
        if (!module) return <div className="text-center py-12 text-gray-500">{t.noData}</div>;
        return (
          <div id="planner-content-area" className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/10 bg-white/5 flex justify-between items-center no-print">
              <div>
                <h3 className="text-lg font-bold text-white">{module.name}</h3>
                <p className="text-sm text-gray-400">
                  {semester?.title} • {module.hourlyVolume}
                  {trainingMode === 'alternance' && ` (EFP: ${module.efpHours} | ENT: ${module.enterpriseHours})`}
                </p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => loadModuleExam(selectedExamType, false)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-xl border border-orange-500/30 transition-all text-xs font-bold"
                >
                  <FileText className="w-4 h-4" />
                  {t.table.generateModuleExam}
                </button>
                <button 
                  onClick={() => loadModuleExam(selectedExamType, true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl border border-green-500/30 transition-all text-xs font-bold"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t.table.generateModelAnswer}
                </button>
                <button 
                  onClick={exportModuleToWord}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30 transition-all text-xs font-bold"
                >
                  <Download className="w-4 h-4" />
                  {t.downloadModule}
                </button>
                <button onClick={exportToPDF} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white" title="PDF">
                  <FileDown className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-start border-collapse">
                <thead>
                  <tr className="bg-white/10 text-white">
                    <th className="p-3 border border-white/10 font-black uppercase tracking-widest text-[10px]">{t.table.week}</th>
                    {trainingMode === 'alternance' && (
                      <th className="p-3 border border-white/10 font-black uppercase tracking-widest text-[10px]">Mode</th>
                    )}
                    <th className="p-3 border border-white/10 font-black uppercase tracking-widest text-[10px]">{t.table.title}</th>
                    <th className="p-3 border border-white/10 font-black uppercase tracking-widest text-[10px]">{t.table.practicalObjective}</th>
                    <th className="p-3 border border-white/10 font-black uppercase tracking-widest text-[10px]">{t.table.teachingMaterials}</th>
                    <th className="p-3 border border-white/10 font-black uppercase tracking-widest text-[10px]">{t.table.evaluation}</th>
                    <th className="p-3 border border-white/10 font-black uppercase tracking-widest text-[10px] no-print">Action</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {isGeneratingModuleLessons ? (
                    <tr>
                      <td colSpan={trainingMode === 'alternance' ? 7 : 6} className="p-12 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <Loader2 className="w-10 h-10 text-yellow-500 animate-spin" />
                          <p className="font-bold text-white animate-pulse">
                            {language === 'ar' ? 'جاري توليد قائمة الدروس (17 أسبوع)...' : 'Génération de la liste des leçons (17 semaines)...'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : module?.lessons?.length > 0 ? module.lessons.map((lesson, idx) => (
                    <tr 
                      key={idx} 
                      className="hover:bg-white/10 transition-colors cursor-pointer group"
                      onClick={() => loadFullLesson(module.name, lesson, idx)}
                    >
                      <td className="p-3 border border-white/10 font-bold text-center text-amber-500">{lesson.week}</td>
                      {trainingMode === 'alternance' && (
                        <td className="p-3 border border-white/10 text-center">
                          <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                            lesson.location === 'EFP' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                          }`}>
                            {lesson.location === 'EFP' ? 'FTTC' : 'ENT'}
                          </span>
                        </td>
                      )}
                      <td className="p-3 border border-white/10 font-semibold text-white group-hover:text-amber-400 transition-colors">{lesson.title}</td>
                      <td className="p-3 border border-white/10 text-xs">{lesson.practicalObjective}</td>
                      <td className="p-3 border border-white/10 text-xs">{lesson.materials?.join(', ') || ''}</td>
                      <td className="p-3 border border-white/10 text-xs font-bold text-amber-400">{lesson.evaluation}</td>
                      <td className="p-3 border border-white/10 text-center no-print">
                        <div className="flex gap-2 justify-center">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              loadFullLesson(module.name, lesson, idx);
                            }}
                            className="p-2 bg-amber-500/10 hover:bg-amber-500 text-amber-500 hover:text-black rounded-lg transition-all"
                            title={t.tabs.generator}
                          >
                            <Zap className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              loadStructuredLessonPlan(idx);
                            }}
                            className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white rounded-lg transition-all"
                            title={t.table.generateLessonPlan}
                          >
                            <ClipboardList className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              loadModulePlan(idx);
                            }}
                            className="p-2 bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white rounded-lg transition-all"
                            title={t.table.generateModulePlan}
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={trainingMode === 'alternance' ? 7 : 6} className="p-12 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <p className="text-gray-500 italic">
                            {language === 'ar' ? 'لا توجد دروس متاحة لهذه الوحدة' : 'Aucune leçon disponible pour ce module'}
                          </p>
                          <button 
                            onClick={loadModuleLessons}
                            className="bg-yellow-500 hover:bg-yellow-600 text-black px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-lg shadow-yellow-500/20 flex items-center gap-2"
                          >
                            <Zap className="w-4 h-4" />
                            {language === 'ar' ? 'توليد الدروس الآن (17 أسبوع)' : 'Générer les leçons maintenant (17 semaines)'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'generator':
      case 'content':
      case 'visuals':
        if (!module || selectedLessonIdx === null) return <div className="text-center py-12 text-gray-500">{t.noData}</div>;
        const lessonSkeleton = module.lessons[selectedLessonIdx];
        const lessonKey = `${module.name}-${lessonSkeleton.week}-${language}-${trainingMode}`;
        const lessonDetails = fullLessons[lessonKey];

        if (isGeneratingLesson) {
          return (
            <div className="flex flex-col items-center justify-center py-24 space-y-6">
              <Loader2 className="w-16 h-16 text-yellow-500 animate-spin" />
              <p className="text-xl font-bold text-white animate-pulse">
                {language === 'ar' ? 'جاري توليد محتوى الدرس الكامل...' : 'Génération du contenu complet du cours...'}
              </p>
              <p className="text-gray-400 text-sm">
                {language === 'ar' ? 'نحن نطبق معايير APC الجزائرية بدقة' : 'Nous appliquons rigoureusement les standards APC algériens'}
              </p>
            </div>
          );
        }

        if (!lessonDetails) return <div className="text-center py-12 text-gray-500">{t.noData}</div>;

        if (activeTab === 'generator') {
          return (
            <div className="space-y-12">
            <div id="lesson-content-area" className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2rem] shadow-2xl relative overflow-hidden print:shadow-none print:border-black lesson-card">
                <div className="absolute top-0 right-0 flex items-center">
                  <button 
                    onClick={() => loadStructuredLessonPlan()}
                    className="bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white px-4 py-2 font-bold text-xs transition-all flex items-center gap-2 no-print border-r border-white/10"
                    title={t.table.generateLessonPlan}
                  >
                    <ClipboardList className="w-4 h-4" />
                    {language === 'ar' ? 'مذكرة' : 'Fiche'}
                  </button>
                  <button 
                    onClick={() => loadModulePlan()}
                    className="bg-blue-500/20 hover:bg-blue-500 text-blue-400 hover:text-white px-4 py-2 font-bold text-xs transition-all flex items-center gap-2 no-print border-r border-white/10"
                    title={t.table.generateModulePlan}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    {language === 'ar' ? 'مخطط' : 'Plan'}
                  </button>
                  <button 
                    onClick={() => loadFullLesson(module.name, lessonSkeleton, selectedLessonIdx, 0, true)}
                    className="bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white px-4 py-2 font-bold text-xs transition-all flex items-center gap-2 no-print border-r border-white/10"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {language === 'ar' ? 'إعادة توليد' : 'Regenerate'}
                  </button>
                  <button 
                    onClick={exportToWord}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 font-black text-xs transition-all flex items-center gap-2 no-print shadow-lg shadow-blue-500/20"
                    title={language === 'ar' ? 'تحميل الدرس كاملا (Word)' : 'Download Full Lesson (Word)'}
                  >
                    <FileText className="w-4 h-4" />
                    {language === 'ar' ? 'تحميل (Word)' : 'Download (Word)'}
                  </button>
                  <button 
                    onClick={exportToPDF}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 font-black text-xs transition-all flex items-center gap-2 no-print shadow-lg shadow-red-500/20 border-l border-white/10"
                    title={language === 'ar' ? 'تحميل الدرس كاملا (PDF)' : 'Download Full Lesson (PDF)'}
                  >
                    <FileDown className="w-4 h-4" />
                    {language === 'ar' ? 'تحميل (PDF)' : 'Download (PDF)'}
                  </button>
                  <div className="bg-gradient-to-l from-yellow-400 to-yellow-600 text-black px-6 py-2 font-black uppercase tracking-widest text-xs print:bg-black print:text-white">
                    {t.week} {lessonSkeleton?.week}
                  </div>
                </div>
                
                <div className="border-b border-white/10 pb-6 mb-8 print:border-black">
                  <h3 className="text-3xl font-black uppercase mb-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">{lessonSkeleton?.title}</h3>
                  <div className="flex flex-wrap gap-4 text-sm font-bold text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-yellow-500" /> {module?.hourlyVolume}</span>
                    <span className="flex items-center gap-1"><Target className="w-4 h-4 text-yellow-500" /> {lessonSkeleton?.practicalObjective}</span>
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded border border-white/10 text-[10px] uppercase tracking-tighter">
                      {t.extra.location} {lessonSkeleton?.location === 'EFP' ? t.extra.fttc : t.extra.enterprise}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 rounded border border-white/10 text-[10px] uppercase tracking-tighter">
                      {t.extra.lessonType} {lessonSkeleton?.type === 'theory' ? t.extra.theory : t.extra.practical}
                    </span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <section>
                      <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-amber-500">
                        <div className="w-2 h-2 bg-amber-500 rounded-full" /> {t.extra.introduction}
                      </h4>
                      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 text-sm text-gray-300 leading-relaxed">
                        {lessonDetails?.introduction}
                      </div>
                    </section>

                    <section>
                      <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-amber-500">
                        <div className="w-2 h-2 bg-amber-500 rounded-full" /> {t.extra.professionalSituation}
                      </h4>
                      <div className="p-6 bg-amber-500/5 rounded-2xl border border-amber-500/10 text-sm text-gray-300 leading-relaxed italic">
                        {lessonDetails?.professionalSituation}
                      </div>
                    </section>

                    <section>
                      <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-amber-500">
                        <div className="w-2 h-2 bg-amber-500 rounded-full" /> {t.table.prerequisites}
                      </h4>
                      <ul className="space-y-2">
                        {lessonSkeleton?.prerequisites?.map((obj, oIdx) => (
                          <li key={oIdx} className="flex items-start gap-3 text-sm leading-relaxed text-gray-300">
                            <CheckCircle2 className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
                            <span>{obj}</span>
                          </li>
                        ))}
                      </ul>
                    </section>

                    <section>
                      <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-amber-500">
                        <div className="w-2 h-2 bg-amber-500 rounded-full" /> {t.table.teachingMaterials}
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {lessonSkeleton?.materials?.map((mat, mIdx) => (
                          <span key={mIdx} className="bg-white/5 px-3 py-1 rounded-full border border-white/10 text-xs text-gray-300">{mat}</span>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="space-y-8">
                    <section>
                      <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-amber-500">
                        <div className="w-2 h-2 bg-amber-500 rounded-full" /> {t.table.phase} (Pedagogical Sheet)
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="bg-white/10">
                              <th className="p-2 border border-white/10">{t.table.phase}</th>
                              <th className="p-2 border border-white/10">{t.table.content}</th>
                              <th className="p-2 border border-white/10">{t.table.methods}</th>
                              <th className="p-2 border border-white/10">{t.table.duration}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lessonDetails?.phasesTable?.map((p, pi) => (
                              <tr key={pi}>
                                <td className="p-2 border border-white/10 font-bold flex items-center gap-2">
                                  {p.phase.toLowerCase().includes('intro') || p.phase.toLowerCase().includes('تمهيد') ? <Info className="w-3 h-3 text-blue-400" /> : null}
                                  {p.phase.toLowerCase().includes('learn') || p.phase.toLowerCase().includes('عرض') ? <BookOpen className="w-3 h-3 text-amber-400" /> : null}
                                  {p.phase.toLowerCase().includes('pract') || p.phase.toLowerCase().includes('تطبيق') ? <Wand2 className="w-3 h-3 text-green-400" /> : null}
                                  {p.phase.toLowerCase().includes('eval') || p.phase.toLowerCase().includes('تقييم') ? <GraduationCap className="w-3 h-3 text-red-400" /> : null}
                                  {p.phase}
                                </td>
                                <td className="p-2 border border-white/10">{p.content}</td>
                                <td className="p-2 border border-white/10">{p.method}</td>
                                <td className="p-2 border border-white/10">{p.duration}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </div>
                </div>

                <div className="mt-12">
                  <h4 className="text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 text-amber-500">
                    <div className="w-2 h-2 bg-amber-500 rounded-full" /> APC Pedagogical Card (Tableau APC)
                  </h4>
                  <div className="overflow-x-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="bg-amber-500/10">
                              <th className="p-2 border border-white/10">{t.table.phase}</th>
                              <th className="p-2 border border-white/10">{t.table.teacherActivity}</th>
                              <th className="p-2 border border-white/10">{t.table.traineeActivity}</th>
                              <th className="p-2 border border-white/10">{t.table.materials}</th>
                              <th className="p-2 border border-white/10">{t.table.duration}</th>
                              <th className="p-2 border border-white/10">{t.table.evaluation}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lessonDetails?.apcTable?.map((a, ai) => (
                              <tr key={ai}>
                                <td className="p-2 border border-white/10 font-bold">
                                  {a.phase}
                                  {a.subSituations && a.subSituations.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      <div className="text-[8px] text-yellow-500 uppercase font-black">{t.extra.subSituations}</div>
                                      {(a.subSituations || []).map((sub, si) => (
                                        <div key={si} className="text-[8px] font-normal text-gray-400">• {sub}</div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2 border border-white/10">{a.teacherActivity}</td>
                                <td className="p-2 border border-white/10">{a.traineeActivity}</td>
                                <td className="p-2 border border-white/10">{a.materials}</td>
                                <td className="p-2 border border-white/10">{a.duration}</td>
                                <td className="p-2 border border-white/10 font-bold text-yellow-400">{a.evaluation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (activeTab === 'content') {
          return (
            <div className="space-y-12">
              <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 p-8 shadow-2xl lesson-card relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-yellow-400 to-transparent opacity-50" />
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">{t.week} {lessonSkeleton?.week}</span>
                    <h4 className="text-2xl font-bold mt-1 text-white">{lessonSkeleton?.title}</h4>
                    <div className="flex gap-4 mt-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.extra.location} {lessonSkeleton?.location === 'EFP' ? t.extra.fttc : t.extra.enterprise}</span>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t.extra.lessonType} {lessonSkeleton?.type === 'theory' ? t.extra.theory : t.extra.practical}</span>
                    </div>
                  </div>
                  <div className="w-12 h-12 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center no-print">
                    <Lightbulb className="w-6 h-6 text-yellow-500" />
                  </div>
                </div>
                
                <div className="space-y-12">
                  <section>
                    <h5 className="font-black text-xs uppercase tracking-widest text-blue-500 flex items-center gap-2 mb-4">
                      <Target className="w-4 h-4" /> {language === 'ar' ? 'المنهجية المتبعة' : 'Pedagogical Methodology'}
                    </h5>
                    <div className="bg-blue-500/5 p-8 rounded-[2rem] border border-blue-500/10 text-sm text-gray-300 leading-relaxed italic">
                      {lessonDetails?.methodology}
                    </div>
                  </section>

                  <section>
                    <h5 className="font-black text-xs uppercase tracking-widest text-yellow-500 flex items-center gap-2 mb-4">
                      <FileText className="w-4 h-4" /> {t.extra.teacherScript}
                    </h5>
                    <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-serif italic">
                      {lessonDetails?.teacherScript}
                    </div>
                  </section>

                  <section>
                    <h5 className="font-black text-xs uppercase tracking-widest text-yellow-500 flex items-center gap-2 mb-4">
                      <BookOpen className="w-4 h-4" /> {t.extra.detailedConcepts}
                    </h5>
                    <div className="bg-white/5 p-8 rounded-[2rem] border border-white/10 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {lessonDetails?.detailedConcepts}
                    </div>
                  </section>

                  {lessonDetails?.algerianExamples && lessonDetails.algerianExamples.length > 0 && (
                    <section>
                      <h5 className="font-black text-xs uppercase tracking-widest text-emerald-500 flex items-center gap-2 mb-4">
                        <Flag className="w-4 h-4" /> {t.extra.algerianExamples}
                      </h5>
                      <div className="grid md:grid-cols-2 gap-4">
                        {(lessonDetails?.algerianExamples || []).map((ex, ei) => (
                          <div key={ei} className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 text-xs text-emerald-200/80 italic">
                            {ex}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section>
                    <h5 className="font-black text-xs uppercase tracking-widest text-yellow-500 flex items-center gap-2 mb-4">
                      <Wand2 className="w-4 h-4" /> {t.extra.practicalWork}
                    </h5>
                    <div className="bg-yellow-500/5 p-8 rounded-[2rem] border border-yellow-500/10 space-y-6">
                      <div>
                        <h6 className="text-xs font-bold uppercase text-yellow-500 mb-2">{t.extra.task}</h6>
                        <p className="text-sm text-gray-300">{lessonDetails?.practicalWork?.task}</p>
                      </div>
                      <div className="grid md:grid-cols-3 gap-6">
                        <div>
                          <h6 className="text-xs font-bold uppercase text-yellow-500 mb-2">{t.extra.steps}</h6>
                          <ul className="space-y-2">
                            {lessonDetails?.practicalWork?.steps?.map((step, si) => (
                              <li key={si} className="flex items-start gap-2 text-xs text-gray-400">
                                <span className="w-4 h-4 bg-yellow-500/20 text-yellow-500 rounded flex items-center justify-center text-[8px] font-bold flex-shrink-0">{si + 1}</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h6 className="text-xs font-bold uppercase text-yellow-500 mb-2">{t.extra.tools}</h6>
                          <ul className="space-y-2">
                            {lessonDetails?.practicalWork?.tools?.map((tool, ti) => (
                              <li key={ti} className="flex items-center gap-2 text-xs text-gray-400">
                                <div className="w-1 h-1 bg-yellow-500 rounded-full" />
                                <span>{tool}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h6 className="text-xs font-bold uppercase text-red-500 mb-2">{t.extra.safety}</h6>
                          <ul className="space-y-2">
                            {lessonDetails?.practicalWork?.safety?.map((s, si) => (
                              <li key={si} className="flex items-center gap-2 text-xs text-red-400/80">
                                <AlertCircle className="w-3 h-3" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h5 className="font-black text-xs uppercase tracking-widest text-yellow-500 flex items-center gap-2 mb-4">
                      <CheckCircle2 className="w-4 h-4" /> {t.extra.summary}
                    </h5>
                    <div className="bg-gradient-to-br from-yellow-500/10 to-transparent p-8 rounded-[2rem] border border-yellow-500/20 text-sm text-gray-300 leading-relaxed">
                      {lessonDetails?.summary}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          );
        }

        if (activeTab === 'visuals') {
          return (
            <div className="grid md:grid-cols-1 gap-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-[2rem] border border-white/10 p-8 shadow-2xl lesson-card relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-500">{t.week} {lessonSkeleton?.week}</span>
                    <h4 className="text-xl font-bold mt-1 text-white">{lessonSkeleton?.title}</h4>
                  </div>
                  <ImageIcon className="w-6 h-6 text-yellow-500" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {lessonDetails?.visualSupport?.visuals?.map((v, i) => (
                    <div key={i} className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4 hover:border-yellow-500/30 transition-all">
                      <div className="flex justify-between items-start">
                        <h5 className="font-black text-sm uppercase tracking-tight text-white">{v.title}</h5>
                        <div className="flex flex-col items-end gap-1">
                          <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 text-[8px] font-black uppercase rounded-md border border-yellow-500/20">
                            {v.type}
                          </span>
                          <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[8px] font-black uppercase rounded-md border border-blue-500/20">
                            {v.phase}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{v.description}</p>
                      <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                        <p className="text-[8px] font-black uppercase tracking-widest text-indigo-400 mb-2">{t.extra.aiImagePrompt}</p>
                        <p className="text-[10px] text-gray-500 italic leading-tight">{v.aiPrompt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        }
        return null;
      case 'exams':
        if (selectedLessonIdx !== null && currentData && currentData.semesters) {
          const semester = currentData.semesters.find(s => s.id === selectedSemester);
          const module = semester?.modules[selectedModule ?? 0];
          const lessonKey = `${module?.name}-${module?.lessons[selectedLessonIdx].week}-${language}-${trainingMode}`;
          const lessonDetails = fullLessons[lessonKey];

          if (!lessonDetails) return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-12 h-12 animate-spin mb-4 text-yellow-500" />
              <p className="font-bold tracking-widest uppercase text-xs">{t.loading}</p>
            </div>
          );

          return (
            <div className="space-y-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-8 sm:p-12 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-4 bg-gradient-to-br from-red-500 to-rose-700 rounded-2xl shadow-lg">
                    <GraduationCap className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black uppercase tracking-tight text-white">{t.extra.exercises}</h4>
                    <p className="text-gray-400 text-sm">{t.week} {module?.lessons[selectedLessonIdx].week}: {module?.lessons[selectedLessonIdx].title}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  {lessonDetails?.exercises?.map((ex, i) => (
                    <div key={i} className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Exercise {i + 1} - {ex.difficulty}</span>
                        <div className={`w-2 h-2 rounded-full ${ex.difficulty === 'easy' ? 'bg-green-500' : ex.difficulty === 'medium' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                      </div>
                      <p className="text-sm text-gray-200 font-bold">{ex.question}</p>
                      <div className="p-4 bg-green-500/5 rounded-2xl border border-green-500/10 text-xs text-gray-400 italic">
                        <span className="font-bold text-green-500 block mb-1">{t.extra.solutions}:</span>
                        {ex.solution}
                      </div>
                    </div>
                  ))}
                </div>

                {lessonDetails?.suggestedTest && (
                  <div className="mt-12 p-8 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-[3rem] border border-indigo-500/20">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-3 bg-indigo-500 rounded-2xl">
                        <FileQuestion className="w-6 h-6 text-white" />
                      </div>
                      <h5 className="text-xl font-black uppercase tracking-tight text-white">{t.extra.suggestedTest}</h5>
                    </div>
                    <p className="text-indigo-400 font-bold mb-6">{lessonDetails.suggestedTest.title}</p>
                    <div className="space-y-6">
                      <div className="space-y-4">
                        <p className="text-xs font-black uppercase tracking-widest text-gray-500">{t.extra.questions}</p>
                        {(lessonDetails?.suggestedTest?.questions || []).map((q, qi) => (
                          <div key={qi} className="p-4 bg-white/5 rounded-2xl border border-white/10 text-sm text-gray-300">
                            {q}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-4">
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-500">{t.extra.solutions}</p>
                        {(lessonDetails?.suggestedTest?.solutions || []).map((s, si) => (
                          <div key={si} className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 text-sm text-emerald-200/70">
                            {s}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-8 sm:p-12 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-4 bg-gradient-to-br from-indigo-500 to-blue-700 rounded-2xl shadow-lg">
                    <Languages className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black uppercase tracking-tight text-white">{t.extra.classroomInteraction}</h4>
                  </div>
                </div>
                <div className="p-8 bg-white/5 rounded-[2rem] border border-white/10 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {lessonDetails?.classroomInteraction}
                </div>
              </div>

              <div className="bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-8 sm:p-12 shadow-2xl">
                <div className="flex items-center gap-4 mb-8">
                  <div className="p-4 bg-gradient-to-br from-purple-500 to-violet-700 rounded-2xl shadow-lg">
                    <Target className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black uppercase tracking-tight text-white">{t.extra.lessonEvaluation}</h4>
                  </div>
                </div>
                <div className="space-y-8">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold uppercase text-purple-500">{t.extra.questions}</h5>
                      <ul className="space-y-2">
                        {lessonDetails?.lessonEvaluation?.questions?.map((q, i) => (
                          <li key={i} className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-gray-400">
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold uppercase text-purple-500">{t.extra.practicalTasks}</h5>
                      <ul className="space-y-2">
                        {lessonDetails?.lessonEvaluation?.practicalTasks?.map((pt, i) => (
                          <li key={i} className="p-3 bg-white/5 rounded-xl border border-white/10 text-xs text-gray-400">
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="p-6 bg-green-500/5 rounded-2xl border border-green-500/10">
                    <h5 className="text-xs font-bold uppercase text-green-500 mb-3">{t.extra.detailedCorrection}</h5>
                    <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {lessonDetails?.lessonEvaluation?.detailedCorrection}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        }
        return null;
      case 'lessonPlan':
        if (selectedLessonIdx !== null && currentData && currentData.semesters) {
          const semester = currentData.semesters.find(s => s.id === selectedSemester);
          const module = semester?.modules[selectedModule ?? 0];
          const lessonSkeleton = module?.lessons[selectedLessonIdx];

          return (
            <div className="space-y-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-8 sm:p-12 shadow-2xl">
                <div className="flex justify-between items-center mb-8 no-print">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-700 rounded-2xl shadow-lg">
                      <ClipboardList className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-black uppercase tracking-tight text-white">{t.tabs.lessonPlan}</h4>
                      <p className="text-gray-400 text-sm">{lessonSkeleton?.title}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsEditingLessonPlan(!isEditingLessonPlan)}
                      className={`px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10 ${isEditingLessonPlan ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {isEditingLessonPlan ? <CheckCircle2 className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {isEditingLessonPlan ? t.extra.save : t.extra.edit}
                    </button>
                    <button 
                      onClick={() => downloadAsWord(structuredLessonPlan || '', `Lesson_Plan_${lessonSkeleton?.title}`, 'p')}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <FileDown className="w-4 h-4" />
                      {t.extra.downloadWord}
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10"
                    >
                      <Printer className="w-4 h-4" />
                      {t.extra.downloadPdf}
                    </button>
                  </div>
                </div>

                {!structuredLessonPlan && !isGeneratingPlan && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <div className="w-24 h-24 bg-indigo-500/10 rounded-full flex items-center justify-center">
                      <ClipboardList className="w-12 h-12 text-indigo-500" />
                    </div>
                    <div className="max-w-md">
                      <h5 className="text-xl font-bold text-white mb-2">{language === 'ar' ? 'توليد مذكرة الدرس الذكية' : 'Générer la fiche de leçon intelligente'}</h5>
                      <p className="text-gray-400 text-sm mb-6">{language === 'ar' ? 'قم بتوليد مذكرة درس احترافية منظمة وفق المقاربة بالكفاءات (APC) جاهزة للطباعة.' : 'Générez une fiche de leçon professionnelle structurée selon l\'APC, prête à l\'impression.'}</p>
                      <button 
                        onClick={() => loadStructuredLessonPlan()}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-indigo-500/20"
                      >
                        {language === 'ar' ? 'توليد الآن' : 'Générer maintenant'}
                      </button>
                    </div>
                  </div>
                )}

                {isGeneratingPlan && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Loader2 className="w-12 h-12 animate-spin mb-4 text-indigo-500" />
                    <p className="font-bold tracking-widest uppercase text-xs animate-pulse">{t.analyzing}</p>
                  </div>
                )}

                {structuredLessonPlan && !isGeneratingPlan && (
                  <div 
                    id="lesson-plan-area"
                    contentEditable={isEditingLessonPlan}
                    onBlur={(e) => setStructuredLessonPlan(e.currentTarget.innerHTML)}
                    className={`bg-white p-8 rounded-2xl shadow-inner overflow-auto max-h-[800px] print:max-h-none print:p-0 print:shadow-none outline-none transition-all ${isEditingLessonPlan ? 'ring-4 ring-yellow-500/50 scale-[1.01]' : ''}`}
                    style={{ direction: 'rtl' }}
                    dangerouslySetInnerHTML={{ __html: structuredLessonPlan }}
                  />
                )}
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-bold tracking-widest uppercase text-xs">{language === 'ar' ? 'يرجى اختيار وحدة ودرس أولاً' : 'Veuillez d\'abord sélectionner un module et une leçon'}</p>
          </div>
        );
      case 'modulePlan':
        if (selectedLessonIdx !== null && currentData && currentData.semesters) {
          const semester = currentData.semesters.find(s => s.id === selectedSemester);
          const module = semester?.modules[selectedModule ?? 0];

          return (
            <div className="space-y-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-8 sm:p-12 shadow-2xl">
                <div className="flex justify-between items-center mb-8 no-print">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl shadow-lg">
                      <FileSpreadsheet className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-black uppercase tracking-tight text-white">{t.tabs.modulePlan}</h4>
                      <p className="text-gray-400 text-sm">{module?.name}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setIsEditingModulePlan(!isEditingModulePlan)}
                      className={`px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10 ${isEditingModulePlan ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {isEditingModulePlan ? <CheckCircle2 className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {isEditingModulePlan ? t.extra.save : t.extra.edit}
                    </button>
                    <button 
                      onClick={() => downloadAsWord(modulePlan || '', `Module_Plan_${module?.name}`, 'l')}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <FileDown className="w-4 h-4" />
                      {t.extra.downloadWord}
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10"
                    >
                      <Printer className="w-4 h-4" />
                      {t.extra.downloadPdf}
                    </button>
                  </div>
                </div>

                {!modulePlan && !isGeneratingModulePlan && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center">
                      <FileSpreadsheet className="w-12 h-12 text-emerald-500" />
                    </div>
                    <div className="max-w-md">
                      <h5 className="text-xl font-bold text-white mb-2">{language === 'ar' ? 'توليد مخطط المقياس الذكي' : 'Générer le plan du module intelligent'}</h5>
                      <p className="text-gray-400 text-sm mb-6">{language === 'ar' ? 'قم بتوليد مخطط مقياس احترافي منظم وفق المعايير البيداغوجية الجزائرية.' : 'Générez un plan de module professionnel structuré selon les normes pédagogiques algériennes.'}</p>
                      <button 
                        onClick={() => loadModulePlan()}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-emerald-500/20"
                      >
                        {language === 'ar' ? 'توليد الآن' : 'Générer maintenant'}
                      </button>
                    </div>
                  </div>
                )}

                {isGeneratingModulePlan && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Loader2 className="w-12 h-12 animate-spin mb-4 text-emerald-500" />
                    <p className="font-bold tracking-widest uppercase text-xs animate-pulse">{t.analyzing}</p>
                  </div>
                )}

                {modulePlan && !isGeneratingModulePlan && (
                  <div 
                    id="module-plan-area"
                    contentEditable={isEditingModulePlan}
                    onBlur={(e) => setModulePlan(e.currentTarget.innerHTML)}
                    className={`bg-white p-8 rounded-2xl shadow-inner overflow-auto max-h-[800px] print:max-h-none print:p-0 print:shadow-none outline-none transition-all ${isEditingModulePlan ? 'ring-4 ring-yellow-500/50 scale-[1.01]' : ''}`}
                    style={{ direction: 'rtl' }}
                    dangerouslySetInnerHTML={{ __html: modulePlan }}
                  />
                )}
              </div>
            </div>
          );
        }
        return (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-bold tracking-widest uppercase text-xs">{language === 'ar' ? 'يرجى اختيار وحدة ودرس أولاً' : 'Veuillez d\'abord sélectionner un module et une leçon'}</p>
          </div>
        );
      case 'moduleExam':
        if (currentData && currentData.semesters) {
          const semester = currentData.semesters.find(s => s.id === selectedSemester);
          const module = semester?.modules[selectedModule ?? 0];

          return (
            <div className="space-y-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-8 sm:p-12 shadow-2xl">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 no-print">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-orange-500 to-red-700 rounded-2xl shadow-lg">
                      <FileText className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-black uppercase tracking-tight text-white">{t.tabs.moduleExam}</h4>
                      <p className="text-gray-400 text-sm">{module?.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setIsEditingModuleExam(!isEditingModuleExam)}
                      className={`px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10 ${isEditingModuleExam ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {isEditingModuleExam ? <CheckCircle2 className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {isEditingModuleExam ? t.extra.save : t.extra.edit}
                    </button>
                    <button 
                      onClick={() => downloadAsWord(moduleExams[selectedExamType] || '', `Exam_${selectedExamType}_${module?.name}`, 'p')}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <FileDown className="w-4 h-4" />
                      {t.extra.downloadWord}
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10"
                    >
                      <Printer className="w-4 h-4" />
                      {t.extra.downloadPdf}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mb-8 no-print">
                  {(['comprehensive_1', 'comprehensive_2', 'remedial', 'control_1', 'control_2'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedExamType(type)}
                      className={`px-6 py-3 rounded-2xl font-bold text-xs transition-all border ${selectedExamType === type ? 'bg-orange-500 text-white border-orange-400 shadow-lg shadow-orange-500/20' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}
                    >
                      {t.extra.examTypes[type]}
                    </button>
                  ))}
                </div>

                {!moduleExams[selectedExamType] && !isGeneratingModuleExam && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center">
                      <FileText className="w-12 h-12 text-orange-500" />
                    </div>
                    <div className="max-w-md">
                      <h5 className="text-xl font-bold text-white mb-2">{t.extra.examTypes[selectedExamType]}</h5>
                      <p className="text-gray-400 text-sm mb-6">{language === 'ar' ? 'قم بتوليد امتحان احترافي وفق النموذج الرسمي الجزائري.' : 'Générez un examen professionnel selon le modèle officiel algérien.'}</p>
                      <button 
                        onClick={() => loadModuleExam(selectedExamType, false)}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-orange-500/20"
                      >
                        {language === 'ar' ? 'توليد الآن' : 'Générer maintenant'}
                      </button>
                    </div>
                  </div>
                )}

                {isGeneratingModuleExam && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Loader2 className="w-12 h-12 animate-spin mb-4 text-orange-500" />
                    <p className="font-bold tracking-widest uppercase text-xs animate-pulse">{t.analyzing}</p>
                  </div>
                )}

                {moduleExams[selectedExamType] && !isGeneratingModuleExam && (
                  <div 
                    id="module-exam-area"
                    className="bg-gray-900/80 p-4 sm:p-12 rounded-[3rem] border border-white/10 overflow-auto max-h-[1200px] print:max-h-none print:p-0 print:bg-transparent print:border-none shadow-2xl relative group"
                  >
                    <div 
                      contentEditable={isEditingModuleExam}
                      onBlur={(e) => setModuleExams(prev => ({ ...prev, [selectedExamType]: e.currentTarget.innerHTML }))}
                      className={`bg-white p-8 sm:p-16 mx-auto shadow-[0_0_50px_rgba(0,0,0,0.3)] print:shadow-none outline-none transition-all min-h-[1123px] w-full max-w-[850px] relative ${isEditingModuleExam ? 'ring-8 ring-orange-500/30 scale-[1.02] z-10' : ''}`}
                      style={{ direction: 'rtl', color: '#000', backgroundColor: '#fff' }}
                    >
                      <div dangerouslySetInnerHTML={{ __html: moduleExams[selectedExamType] }} />
                    </div>
                    {isEditingModuleExam && (
                      <div className="absolute top-4 right-4 bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold animate-bounce shadow-lg z-20">
                        {language === 'ar' ? 'وضع التعديل نشط' : 'Mode édition actif'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }
        return null;
      case 'modelAnswer':
        if (currentData && currentData.semesters) {
          const semester = currentData.semesters.find(s => s.id === selectedSemester);
          const module = semester?.modules[selectedModule ?? 0];

          return (
            <div className="space-y-8">
              <div className="bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-8 sm:p-12 shadow-2xl">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 no-print">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-gradient-to-br from-green-500 to-emerald-700 rounded-2xl shadow-lg">
                      <CheckCircle2 className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h4 className="text-2xl font-black uppercase tracking-tight text-white">{t.tabs.modelAnswer}</h4>
                      <p className="text-gray-400 text-sm">{module?.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => setIsEditingModelAnswer(!isEditingModelAnswer)}
                      className={`px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10 ${isEditingModelAnswer ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {isEditingModelAnswer ? <CheckCircle2 className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                      {isEditingModelAnswer ? t.extra.save : t.extra.edit}
                    </button>
                    <button 
                      onClick={() => downloadAsWord(modelAnswers[selectedExamType] || '', `Model_Answer_${selectedExamType}_${module?.name}`, 'p')}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      <FileDown className="w-4 h-4" />
                      {t.extra.downloadWord}
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl font-bold text-xs transition-all flex items-center gap-2 border border-white/10"
                    >
                      <Printer className="w-4 h-4" />
                      {t.extra.downloadPdf}
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3 mb-8 no-print">
                  {(['comprehensive_1', 'comprehensive_2', 'remedial', 'control_1', 'control_2'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedExamType(type)}
                      className={`px-6 py-3 rounded-2xl font-bold text-xs transition-all border ${selectedExamType === type ? 'bg-green-500 text-white border-green-400 shadow-lg shadow-green-500/20' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'}`}
                    >
                      {t.extra.examTypes[type]}
                    </button>
                  ))}
                </div>

                {!modelAnswers[selectedExamType] && !isGeneratingModelAnswer && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                    <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-12 h-12 text-green-500" />
                    </div>
                    <div className="max-w-md">
                      <h5 className="text-xl font-bold text-white mb-2">{t.tabs.modelAnswer} - {t.extra.examTypes[selectedExamType]}</h5>
                      <p className="text-gray-400 text-sm mb-6">{language === 'ar' ? 'قم بتوليد الإجابة النموذجية للامتحان مع سلم التنقيط.' : 'Générez le corrigé type de l\'examen avec le barème de notation.'}</p>
                      <button 
                        onClick={() => loadModuleExam(selectedExamType, true)}
                        className="bg-green-500 hover:bg-green-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-green-500/20"
                      >
                        {language === 'ar' ? 'توليد الآن' : 'Générer maintenant'}
                      </button>
                    </div>
                  </div>
                )}

                {isGeneratingModelAnswer && (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Loader2 className="w-12 h-12 animate-spin mb-4 text-green-500" />
                    <p className="font-bold tracking-widest uppercase text-xs animate-pulse">{t.analyzing}</p>
                  </div>
                )}

                {modelAnswers[selectedExamType] && !isGeneratingModelAnswer && (
                  <div 
                    id="model-answer-area"
                    className="bg-gray-900/80 p-4 sm:p-12 rounded-[3rem] border border-white/10 overflow-auto max-h-[1200px] print:max-h-none print:p-0 print:bg-transparent print:border-none shadow-2xl relative group"
                  >
                    <div 
                      contentEditable={isEditingModelAnswer}
                      onBlur={(e) => setModelAnswers(prev => ({ ...prev, [selectedExamType]: e.currentTarget.innerHTML }))}
                      className={`bg-white p-8 sm:p-16 mx-auto shadow-[0_0_50px_rgba(0,0,0,0.3)] print:shadow-none outline-none transition-all min-h-[1123px] w-full max-w-[850px] relative ${isEditingModelAnswer ? 'ring-8 ring-green-500/30 scale-[1.02] z-10' : ''}`}
                      style={{ direction: 'rtl', color: '#000', backgroundColor: '#fff' }}
                    >
                      <div dangerouslySetInnerHTML={{ __html: modelAnswers[selectedExamType] }} />
                    </div>
                    {isEditingModelAnswer && (
                      <div className="absolute top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-full text-xs font-bold animate-bounce shadow-lg z-20">
                        {language === 'ar' ? 'وضع التعديل نشط' : 'Mode édition actif'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }
        return null;
      case 'export':
        return (
          <div className="max-w-xl mx-auto bg-white/5 backdrop-blur-xl rounded-[3rem] border border-white/10 p-12 text-center shadow-2xl no-print">
            <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-lg shadow-yellow-500/20">
              <Printer className="w-12 h-12 text-black" />
            </div>
            <h3 className="text-3xl font-black uppercase tracking-tight mb-4 text-white">{t.tabs.export}</h3>
            <p className="text-gray-400 mb-10">{language === 'ar' ? 'قم بتصدير المخطط البيداغوجي بصيغ جاهزة للطباعة' : 'Exportez le planning pédagogique dans des formats prêts pour l\'impression'}</p>
            
            <div className="grid grid-cols-2 gap-6">
              <button 
                onClick={exportToPDF}
                className="flex flex-col items-center gap-4 p-8 bg-white/5 rounded-3xl border border-white/10 hover:border-yellow-500/50 hover:bg-white/10 transition-all group"
              >
                <div className="p-4 bg-red-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                  <FileDown className="w-10 h-10 text-red-500" />
                </div>
                <span className="font-bold text-white">{t.downloadPDF}</span>
              </button>
              <button 
                onClick={exportToWord}
                className="flex flex-col items-center gap-4 p-8 bg-white/5 rounded-3xl border border-white/10 hover:border-yellow-500/50 hover:bg-white/10 transition-all group"
              >
                <div className="p-4 bg-blue-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                  <Download className="w-10 h-10 text-blue-500" />
                </div>
                <span className="font-bold text-white">Word (.docx)</span>
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen bg-[#050505] text-white font-sans ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Luxurious Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[50%] bg-amber-600/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[30%] bg-indigo-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Header */}
      <header className="bg-black/40 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 via-yellow-500 to-amber-600 rounded-2xl flex items-center justify-center text-black shadow-lg shadow-amber-500/20">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter sm:block bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent uppercase">
                {t.title}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  {t.designerLabel} <span className="text-amber-500/80">{t.designer}</span>
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={resetProgram}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-all font-bold text-xs text-red-400 uppercase tracking-widest"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden md:inline">{t.reloadProgram}</span>
            </button>
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all font-bold text-xs text-white uppercase tracking-widest"
            >
              <Globe className="w-4 h-4 text-amber-500" />
              <span>{language === 'ar' ? 'Français' : 'العربية'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        {!programData ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto space-y-12 no-print"
          >
            {/* Training Mode Selection */}
            <div className="bg-white/5 backdrop-blur-3xl rounded-[3.5rem] border border-white/5 p-10 sm:p-16 shadow-[0_0_50px_-12px_rgba(245,158,11,0.1)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[100px] -mr-32 -mt-32" />
              
              <h3 className="text-sm font-black uppercase tracking-[0.4em] text-amber-500 mb-12 flex items-center gap-4">
                <div className="w-8 h-[1px] bg-amber-500/30" /> {t.trainingModeLabel}
              </h3>
              
              <div className="grid sm:grid-cols-3 gap-8">
                {(['presentiel', 'alternance', 'qualification'] as TrainingMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setTrainingMode(mode)}
                    className={`p-8 rounded-[3rem] border transition-all text-start relative overflow-hidden group ${
                      trainingMode === mode 
                        ? 'bg-gradient-to-br from-amber-400 to-amber-600 border-transparent text-black shadow-2xl shadow-amber-500/30 scale-[1.02]' 
                        : 'bg-white/[0.03] border-white/5 text-white hover:bg-white/[0.07] hover:border-white/10'
                    }`}
                  >
                    <div className="relative z-10">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-colors ${trainingMode === mode ? 'bg-black/10 text-black' : 'bg-white/5 text-amber-500 group-hover:bg-amber-500 group-hover:text-black'}`}>
                        {mode === 'presentiel' ? <BookOpen className="w-6 h-6" /> : mode === 'alternance' ? <RefreshCw className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
                      </div>
                      <p className="font-black uppercase tracking-tight text-xl mb-2">{t.modes[mode].title}</p>
                      <p className={`text-xs leading-relaxed font-medium ${trainingMode === mode ? 'text-black/80' : 'text-gray-500'}`}>
                        {t.modes[mode].desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="max-w-2xl mx-auto text-center">
              <h2 className="text-4xl sm:text-6xl font-black mb-6 tracking-tighter bg-gradient-to-b from-white via-white to-white/40 bg-clip-text text-transparent uppercase">
                {t.title}
              </h2>
              <p className="text-gray-500 mb-16 text-lg font-medium tracking-wide max-w-lg mx-auto leading-relaxed">{t.subtitle}</p>

              <div className="bg-white/[0.02] backdrop-blur-3xl p-10 rounded-[4rem] border border-white/5 shadow-2xl relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 to-blue-500/20 blur opacity-20 pointer-events-none" />
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-8">
                  <div className="relative">
                    <div className="w-32 h-32 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Zap className="w-12 h-12 text-amber-500 animate-pulse" />
                    </div>
                  </div>
                  <div className="text-center space-y-4">
                    <h3 className="text-2xl font-bold text-white animate-pulse">{t.analyzing}</h3>
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-amber-500 font-mono text-sm tracking-widest uppercase px-4 py-2 bg-amber-500/10 rounded-full border border-amber-500/20">
                        {analysisProgress}
                      </p>
                      <p className="text-gray-500 text-xs italic max-w-xs">
                        {language === 'ar' 
                          ? 'يرجى عدم إغلاق الصفحة، قد يستغرق التحليل الكامل بضع دقائق حسب حجم الملف.' 
                          : 'Veuillez ne pas fermer la page, l\'analyse complète peut prendre quelques minutes selon la taille du fichier.'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <label 
                    className={`
                      relative group cursor-pointer block border-2 border-dashed rounded-2xl p-12 transition-all
                      ${files.length > 0 ? 'border-green-500 bg-green-500/10' : 'border-white/20 hover:border-amber-500/50 hover:bg-white/5'}
                    `}
                  >
                    <input 
                      type="file" 
                      className="hidden" 
                      multiple
                      accept=".pdf,image/*" 
                      onChange={handleFileChange}
                    />
                    <div className="flex flex-col items-center gap-4">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${files.length > 0 ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-amber-500'}`}>
                        {files.length > 0 ? <CheckCircle2 className="w-8 h-8" /> : <Upload className="w-8 h-8" />}
                      </div>
                      <div>
                        <p className="font-semibold text-lg text-white">{t.uploadLabel}</p>
                        <p className="text-sm text-gray-400 mt-1">{t.uploadHint}</p>
                      </div>
                    </div>
                  </label>

                  {files.length > 0 && (
                    <div className="mt-6 space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-3">
                            {f.type === 'application/pdf' ? <FileText className="w-4 h-4 text-red-400" /> : <ImageIcon className="w-4 h-4 text-blue-400" />}
                            <span className="text-sm text-white truncate max-w-[200px]">{f.name}</span>
                          </div>
                          <button 
                            onClick={() => removeFile(i)}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <AlertCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 p-4 bg-red-500/10 text-red-400 rounded-xl flex items-center gap-3 text-sm font-medium border border-red-500/20"
                    >
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      {error}
                    </motion.div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => startAnalysis(true)}
                      disabled={files.length === 0 || isAnalyzing}
                      className={`
                        py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3
                        ${files.length === 0 || isAnalyzing 
                          ? 'bg-white/5 text-gray-500 cursor-not-allowed' 
                          : 'bg-white/10 text-amber-500 border border-amber-500/30 hover:bg-white/20 shadow-lg shadow-amber-500/5'}
                      `}
                    >
                      <Zap className="w-6 h-6" />
                      {language === 'ar' ? '⚡ مسح سريع (استخراج الوحدات)' : '⚡ Quick Scan (extract modules)'}
                    </motion.button>

                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => startAnalysis(false)}
                      disabled={files.length === 0 || isAnalyzing}
                      className={`
                        py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3
                        ${files.length === 0 || isAnalyzing 
                          ? 'bg-white/5 text-gray-500 cursor-not-allowed' 
                          : 'bg-gradient-to-r from-amber-400 to-amber-600 text-black hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-500/20'}
                      `}
                    >
                      <FileText className="w-6 h-6" />
                      {language === 'ar' ? 'تحليل كامل للبرنامج' : 'Full Program Analysis'}
                    </motion.button>
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      ) : (() => {
          if (!currentData || !currentData.semesters) return null;
          const semester = currentData.semesters.find(s => s.id === selectedSemester);
          const module = semester?.modules[selectedModule ?? 0];
          return (
          <div className="space-y-8">
            {/* Luxury Dashboard Navigation */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4 no-print">
              {[
                { id: 'overview', icon: LayoutGrid, label: t.tabs.overview, color: "from-blue-500 to-blue-700" },
                { id: 'modules', icon: Library, label: t.tabs.modules, color: "from-indigo-500 to-indigo-700" },
                { id: 'planner', icon: CalendarDays, label: t.tabs.planner, color: "from-amber-500 to-amber-700" },
                { id: 'generator', icon: Wand2, label: t.tabs.generator, color: "from-purple-500 to-purple-700" },
                { id: 'content', icon: Lightbulb, label: t.tabs.content, color: "from-emerald-500 to-emerald-700" },
                { id: 'visuals', icon: ImageIcon, label: t.tabs.visuals, color: "from-cyan-500 to-cyan-700" },
                { id: 'exams', icon: GraduationCap, label: t.tabs.exams, color: "from-rose-500 to-rose-700" },
                { id: 'lessonPlan', icon: ClipboardList, label: t.tabs.lessonPlan, color: "from-orange-500 to-orange-700" },
                { id: 'modulePlan', icon: FileSpreadsheet, label: t.tabs.modulePlan, color: "from-teal-500 to-teal-700" },
                { id: 'moduleExam', icon: FileQuestion, label: t.tabs.moduleExam, color: "from-pink-500 to-pink-700" },
                { id: 'modelAnswer', icon: CheckCircle2, label: t.tabs.modelAnswer, color: "from-green-500 to-green-700" },
                { id: 'export', icon: FileDown, label: t.tabs.export, color: "from-slate-600 to-slate-800" },
                { id: 'reload', icon: RotateCcw, label: t.exitReload, color: "from-red-500 to-red-700" },
              ].map((tab) => (
                <motion.button
                  key={tab.id}
                  whileHover={{ scale: 1.05, y: -5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (tab.id === 'reload') {
                      resetProgram();
                    } else {
                      setActiveTab(tab.id as Tab);
                    }
                  }}
                  className={`
                    relative group flex flex-col items-center gap-3 p-5 rounded-[2.5rem] border transition-all overflow-hidden
                    ${activeTab === tab.id 
                      ? 'bg-white/[0.07] border-white/20 shadow-2xl shadow-black/50' 
                      : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.05]'}
                  `}
                >
                  <div className={`p-4 rounded-2xl bg-gradient-to-br ${tab.color} shadow-lg group-hover:shadow-xl transition-all relative z-10`}>
                    <tab.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest text-center relative z-10 ${activeTab === tab.id ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>
                    {tab.label}
                  </span>
                  {activeTab === tab.id && (
                    <motion.div 
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none"
                    />
                  )}
                </motion.button>
              ))}
            </div>

            {/* Module Selector Bar */}
            {activeTab !== 'modules' && (
              <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 flex flex-wrap items-center gap-4 shadow-xl no-print">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-gray-400" />
                  <select 
                    value={selectedSemester || ''} 
                    onChange={(e) => {
                      setSelectedSemester(e.target.value);
                      setSelectedLessonIdx(null);
                    }}
                    className="bg-transparent font-bold text-sm focus:outline-none cursor-pointer text-white"
                  >
                    {currentData?.semesters?.map(s => <option key={s.id} value={s.id} className="bg-slate-900">{s.title}</option>)}
                  </select>
                </div>
                <div className="h-6 w-px bg-white/10 hidden sm:block" />
                <div className="flex items-center gap-2 flex-1">
                  <BookOpen className="w-5 h-5 text-gray-400" />
                  <select 
                    value={selectedModule ?? ''} 
                    onChange={(e) => {
                      setSelectedModule(Number(e.target.value));
                      setSelectedLessonIdx(null);
                    }}
                    className="bg-transparent font-bold text-sm focus:outline-none cursor-pointer w-full max-w-md text-white"
                  >
                    {currentData?.semesters?.find(s => s.id === selectedSemester)?.modules?.map((m, i) => (
                      <option key={i} value={i} className="bg-slate-900">{m.name}</option>
                    ))}
                  </select>
                </div>
                
                {['generator', 'content', 'visuals'].includes(activeTab) && module && (
                  <>
                    <div className="h-6 w-px bg-white/10 hidden lg:block" />
                    <div className="flex items-center gap-2 flex-1">
                      <GraduationCap className="w-5 h-5 text-gray-400" />
                      <select 
                        value={selectedLessonIdx ?? ''} 
                        onChange={(e) => {
                          const idx = Number(e.target.value);
                          if (module?.lessons?.[idx]) {
                            loadFullLesson(module.name, module.lessons[idx], idx);
                          }
                        }}
                        className="bg-transparent font-bold text-sm focus:outline-none cursor-pointer w-full max-w-md text-white"
                      >
                        <option value="" disabled className="bg-slate-900">{t.tabs.generator}</option>
                        {module?.lessons?.map((l, i) => (
                          <option key={i} value={i} className="bg-slate-900">{t.week} {l.week}: {l.title}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <button 
                  onClick={exportToPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-sm font-bold text-white border border-white/10"
                >
                  <Printer className="w-4 h-4" />
                  <span className="hidden sm:inline">{language === 'ar' ? 'تحميل PDF' : 'Télécharger PDF'}</span>
                </button>
              </div>
            )}

            {/* Content Area */}
            <div className="min-h-[400px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderTabContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          );
        })()}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-16 border-t border-white/5 text-center no-print">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-3xl flex items-center justify-center text-black shadow-2xl shadow-amber-500/20">
            <GraduationCap className="w-8 h-8" />
          </div>
          <div>
            <p className="text-white font-black uppercase tracking-[0.2em] text-sm mb-2">{t.title}</p>
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-6">© {new Date().getFullYear()} • {language === 'ar' ? 'قطاع التكوين والتعليم المهنيين' : 'Secteur de la Formation et de l’Enseignement Professionnels'}</p>
            
            <div className="inline-flex flex-col items-center p-6 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.3em] mb-3">{t.designerLabel}</p>
              <p className="text-lg font-bold text-white mb-1">{t.designer}</p>
              <p className="text-xs text-gray-500 italic">أستاذ التكوين المهني • خبير في المقاربة بالكفاءات (APC)</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mt-8 font-mono">Powered by Advanced AI • Algerian Vocational Training System</p>
        </div>
      </footer>
    </div>
  );
}
