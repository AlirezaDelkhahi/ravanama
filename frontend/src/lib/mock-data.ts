import {
  formatJalaliKey,
  gregorianToJalali,
  jalaliToGregorian,
  weekdaySat0,
  type CurrencyCode,
} from "./jalali";

export type BookingTrack = "iran" | "abroad";

export type BookingStatus =
  | "held"
  | "pending_verification"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "completed";

export interface ServiceOffering {
  id: string;
  title: string;
  description: string;
  track: BookingTrack;
  durationMinutes: number;
  priceAmount: number; // Integer: IRT in Toman, USD/EUR in minor cents
  currency: CurrencyCode;
}

export interface EducationTimelineItem {
  id: string;
  periodJalali: string;
  degree: string;
  institution: string;
  note?: string;
}

export interface VerifiedReflection {
  id: string;
  clientLabel: string;
  rating: number;
  comment: string;
  dateJalali: string;
}

export interface BlogHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface BlogSection {
  headingId: string;
  headingText: string;
  level: 2 | 3;
  paragraphs: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string;
  publishedAtJalali: string;
  publishedAtIso: string;
  readingMinutes: number;
  status: "published" | "draft";
  seoTitle: string;
  seoDescription: string;
  sections: BlogSection[];
}

export interface WeeklyWindow {
  id: string;
  startTime: string; // "HH:mm" in Asia/Tehran
  endTime: string; // "HH:mm" in Asia/Tehran
}

export interface WeeklyScheduleRule {
  weekdaySat0: number; // 0 = شنبه .. 6 = جمعه
  enabled: boolean;
  windows: WeeklyWindow[];
}

export interface JalaliOverride {
  id: string;
  jalaliKey: string; // "1405-09-10"
  jalaliLabel: string; // "۱۴۰۵/۰۹/۱۰"
  type: "closed" | "custom_hours";
  note: string;
  windows: WeeklyWindow[];
}

export interface TherapistPaymentAccounts {
  iran: {
    bankName: string;
    accountHolder: string;
    cardPan: string;
    sheba: string;
  };
  abroad: {
    paypal?: {
      email: string;
      holderName: string;
    };
    iban?: {
      bankName: string;
      iban: string;
      bic: string;
      holderName: string;
    };
    usdt?: {
      network: string;
      address: string;
    };
  };
}

export interface TherapistProfile {
  id: string;
  slug: string;
  displayName: string;
  subtitle: string;
  licenseNumber: string;
  licenseAuthority: string;
  experienceYears: number;
  sessionsHeldLabel: string;
  avatarUrl: string;
  directoryOptIn: boolean;
  customDomain: string | null;
  customDomainVerified: boolean;
  bio: string;
  approachSummary: string;
  focusAreas: string[]; // Max 8 monochrome chips
  reviewsEnabled: boolean;
  educationTimeline: EducationTimelineItem[];
  reflections: VerifiedReflection[];
  offerings: ServiceOffering[];
  blogPosts: BlogPost[];
  weeklySchedule: WeeklyScheduleRule[];
  jalaliOverrides: JalaliOverride[];
}

export interface TimeSlotOption {
  id: string;
  isoUtc: string;
  tehranJalaliKey: string; // "1405-09-07"
  tehranTimeFa: string; // "۱۶:۰۰"
  tehranHour: number;
  tehranMinute: number;
}

export interface RebookPreset {
  bookingId: string;
  therapistSlug: string;
  track: BookingTrack;
  serviceId: string;
  clientName: string;
  phoneDialCode: string;
  phoneNational: string;
  email: string;
  note: string;
  rejectionReason: string;
}

export interface ClientSessionRecord {
  id: string;
  referenceCode: string;
  therapistSlug: string;
  therapistName: string;
  therapistSubtitle: string;
  serviceTitle: string;
  track: BookingTrack;
  clientTimezone: string;
  startIsoUtc: string;
  durationMinutes: number;
  dateTimeJalaliLabel: string;
  amount: number;
  currency: CurrencyCode;
  status: BookingStatus;
  callJoinUrl?: string; // Strictly present ONLY when confirmed or completed
  rejectionReason?: string;
  trackingCode?: string;
  hasReview?: boolean;
  rebookPreset?: RebookPreset;
}

export interface DashboardBookingRecord {
  id: string;
  referenceCode: string;
  clientName: string;
  clientContactDisplay: string;
  track: BookingTrack;
  serviceTitle: string;
  durationMinutes: number;
  slotLabelJalali: string;
  slotLabelDual?: string;
  amount: number;
  currency: CurrencyCode;
  status: Extract<
    BookingStatus,
    "pending_verification" | "confirmed" | "completed" | "rejected"
  >;
  trackingCode: string;
  receiptImageUrl: string;
  submittedAtJalali: string;
  callJoinUrl?: string;
  rejectionReason?: string;
  clientNote?: string;
}

const SARA_WEEKLY_SCHEDULE: WeeklyScheduleRule[] = [
  {
    weekdaySat0: 0,
    enabled: true,
    windows: [
      { id: "w-sat-1", startTime: "10:00", endTime: "13:00" },
      { id: "w-sat-2", startTime: "16:00", endTime: "20:00" },
    ],
  },
  {
    weekdaySat0: 1,
    enabled: true,
    windows: [
      { id: "w-sun-1", startTime: "11:30", endTime: "14:30" },
      { id: "w-sun-2", startTime: "16:00", endTime: "19:30" },
    ],
  },
  {
    weekdaySat0: 2,
    enabled: true,
    windows: [
      { id: "w-mon-1", startTime: "10:00", endTime: "13:00" },
      { id: "w-mon-2", startTime: "16:00", endTime: "20:00" },
    ],
  },
  {
    weekdaySat0: 3,
    enabled: true,
    windows: [
      { id: "w-tue-1", startTime: "14:30", endTime: "19:30" },
    ],
  },
  {
    weekdaySat0: 4,
    enabled: true,
    windows: [
      { id: "w-wed-1", startTime: "10:00", endTime: "13:00" },
      { id: "w-wed-2", startTime: "16:00", endTime: "20:00" },
    ],
  },
  {
    weekdaySat0: 5,
    enabled: true,
    windows: [{ id: "w-thu-1", startTime: "11:30", endTime: "16:30" }],
  },
  {
    weekdaySat0: 6,
    enabled: false,
    windows: [],
  },
];

const SARA_OVERRIDES: JalaliOverride[] = [
  {
    id: "ovr-1",
    jalaliKey: "1405-09-10",
    jalaliLabel: "۱۴۰۵/۰۹/۱۰",
    type: "closed",
    note: "مرخصی روزانه (عدم پذیرش جلسه)",
    windows: [],
  },
  {
    id: "ovr-2",
    jalaliKey: "1405-09-12",
    jalaliLabel: "۱۴۰۵/۰۹/۱۲",
    type: "custom_hours",
    note: "ساعت کاری اختصاصی عصر",
    windows: [{ id: "w-ovr-12", startTime: "14:30", endTime: "18:30" }],
  },
];

export const THERAPISTS: readonly TherapistProfile[] = [
  {
    id: "th-sara-ahmadi",
    slug: "dr-sara-ahmadi",
    displayName: "دکتر سارا احمدی",
    subtitle: "روانشناس بالینی و زوج‌درمانگر",
    licenseNumber: "۱۴۸۹۲",
    licenseAuthority: "سازمان نظام روانشناسی و مشاوره",
    experienceYears: 12,
    sessionsHeldLabel: "۴٬۲۰۰+ جلسه",
    avatarUrl: "/images/therapist-sara.jpg",
    directoryOptIn: true,
    customDomain: "dr-sara.ir",
    customDomainVerified: true,
    bio: "روان‌شناس بالینی با بیش از دوازده سال تجربه درمان فردی و زوج‌درمانی برای مراجعان ساکن ایران و ایرانیان مهاجر. جلسات در فضایی محرمانه، بدون قضاوت و مبتنی بر شواهد علمی برگزار می‌شود تا الگوهای تکراری اضطراب، تعارض‌های رابطه‌ای و فشارهای ناشی از مهاجرت به شکل ریشه‌ای بررسی و التیام یابند.",
    approachSummary:
      "درمان مبتنی بر پذیرش و تعهد (ACT) در کنار زوج‌درمانی هیجان‌مدار (EFT) و روان‌درمانی پویشی کوتاه‌مدت، با تمرکز بر ساختن امنیت عاطفی و انعطاف‌پذیری روانی.",
    focusAreas: [
      "اضطراب و تنش روزمره",
      "زوج‌درمانی و تعارض رابطه",
      "فرسودگی شغلی",
      "سازگاری مهاجرت",
      "سوگ و فقدان",
      "تنظیم هیجان",
    ],
    reviewsEnabled: true,
    educationTimeline: [
      {
        id: "edu-1",
        periodJalali: "۱۳۹۹–۱۴۰۱",
        degree: "دوره تخصصی زوج‌درمانی هیجان‌مدار (EFT)",
        institution: "انجمن بین‌المللی ICEEFT",
        note: "تمرکز بر بازسازی پیوند عاطفی و چرخه‌های تعارض زوجین",
      },
      {
        id: "edu-2",
        periodJalali: "۱۳۹۵–۱۳۹۹",
        degree: "دکترای تخصصی روان‌شناسی بالینی",
        institution: "دانشگاه تهران",
        note: "پژوهش درباره انعطاف‌پذیری شناختی و اضطراب فراگیر",
      },
      {
        id: "edu-3",
        periodJalali: "۱۳۹۱–۱۳۹۵",
        degree: "کارشناسی ارشد روان‌شناسی بالینی",
        institution: "دانشگاه شهید بهشتی",
      },
    ],
    reflections: [
      {
        id: "rev-1",
        clientLabel: "مراجع فردی · آبان ۱۴۰۵",
        rating: 5,
        comment:
          "پس از چند ماه تجربه فرسودگی شغلی و اضطراب مزمن، آرامش و ساختار منظم جلسات آنلاین با دکتر احمدی کمک کرد مرزهای سالم‌تری در کار و زندگی بسازم.",
        dateJalali: "۲۴ آبان ۱۴۰۵",
      },
      {
        id: "rev-2",
        clientLabel: "مراجع زوج‌درمانی (برلین) · مهر ۱۴۰۵",
        rating: 5,
        comment:
          "هماهنگی ساعت جلسه با اختلاف زمانی اروپا و فضای امن جلسات زوج‌درمانی باعث شد بدون احساس جانبداری، گفتگوهای دشوار را با همدلی پیش ببریم.",
        dateJalali: "۱۸ مهر ۱۴۰۵",
      },
    ],
    offerings: [
      {
        id: "svc-sara-ir-ind",
        title: "مشاوره فردی آنلاین",
        description: "جلسه اختصاصی فردی برای اضطراب، فرسودگی، سوگ و شناخت الگوهای شخصی",
        track: "iran",
        durationMinutes: 50,
        priceAmount: 1_200_000,
        currency: "IRT",
      },
      {
        id: "svc-sara-ir-cpl",
        title: "زوج‌درمانی آنلاین",
        description: "جلسه مشترک برای بهبود گفتگوی زوجین، ترمیم اعتماد و حل تعارض‌های تکرارشونده",
        track: "iran",
        durationMinutes: 75,
        priceAmount: 1_500_000,
        currency: "IRT",
      },
      {
        id: "svc-sara-ab-ind",
        title: "Individual Therapy (Online)",
        description: "جلسه آنلاین فردی ویژه ایرانیان مقیم خارج از کشور با ساعت محلی و نرخ ارزی",
        track: "abroad",
        durationMinutes: 50,
        priceAmount: 4000,
        currency: "USD",
      },
      {
        id: "svc-sara-ab-cpl",
        title: "Couples Therapy (Online)",
        description: "جلسه زوج‌درمانی آنلاین ۷۵ دقیقه‌ای ویژه زوج‌های مقیم خارج از کشور",
        track: "abroad",
        durationMinutes: 75,
        priceAmount: 5500,
        currency: "USD",
      },
    ],
    blogPosts: [
      {
        slug: "act-for-daily-anxiety",
        title: "چگونه از چرخه نگرانی و نشخوار فکری فاصله بگیریم؟ نگاهی به رویکرد ACT",
        excerpt:
          "جنگیدن مداوم با افکار مضطرب اغلب شدت آن‌ها را بیشتر می‌کند. در این یادداشت بررسی می‌کنیم چگونه پذیرش آگاهانه و اقدام متعهدانه جایگزین سرکوب ذهن می‌شوند.",
        coverImageUrl: "/images/blog-anxiety.jpg",
        publishedAtJalali: "۴ آذر ۱۴۰۵",
        publishedAtIso: "2026-11-25T09:00:00Z",
        readingMinutes: 6,
        status: "published",
        seoTitle: "مدیریت نشخوار فکری و اضطراب با رویکرد ACT | دکتر سارا احمدی",
        seoDescription:
          "راهنمای علمی شناخت چرخه اضطراب و تمرین‌های عملی گسلش شناختی در درمان مبتنی بر پذیرش و تعهد.",
        sections: [
          {
            headingId: "why-control-fails",
            headingText: "چرا تلاش برای حذف کامل اضطراب نتیجه معکوس دارد؟",
            level: 2,
            paragraphs: [
              "بسیاری از مراجعان در جلسات نخست بیان می‌کنند که تمام انرژی روزانه خود را صرف متوقف کردن یک فکر نگران‌کننده می‌کنند. ذهن انسان به شکل طبیعی برای پیش‌بینی خطر طراحی شده است و هرچه بیشتر به آن فرمان «به این موضوع فکر نکن» بدهیم، حساسیت شبکه توجه روی همان موضوع افزایش می‌یابد.",
              "در درمان مبتنی بر پذیرش و تعهد، هدف از بین بردن هیجان‌های ناخوشایند نیست؛ بلکه تغییر رابطه‌ای است که با افکار خود داریم تا اضطراب دیگر فرمان زندگی روزمره را در دست نگیرد.",
            ],
          },
          {
            headingId: "cognitive-defusion-steps",
            headingText: "سه گام عملی برای گسلش از افکار تکراری",
            level: 2,
            paragraphs: [
              "نخستین گام نام‌گذاری فکر است: به جای آنکه بگوییم «من شکست می‌خورم»، جمله را به شکل «متوجه می‌شوم ذهنم در حال ساختن داستان شکست است» بازنویسی می‌کنیم. این فاصله زبانی کوتاه، شدت درگیری هیجانی را به شکل محسوسی کاهش می‌دهد.",
              "در گام دوم، توجه را به حس‌های بدنی لحظه حال برمی‌گردانیم؛ احساس تماس کف پا با زمین یا ریتم آرام بازدم به سیستم عصبی پیام امنیت می‌دهد.",
            ],
          },
          {
            headingId: "values-before-comfort",
            headingText: "بازگشت به ارزش‌های شخصی به جای انتظار برای آرامش کامل",
            level: 3,
            paragraphs: [
              "منتظر ماندن برای روزی که هیچ اضطرابی نداشته باشیم، معمولاً به اجتناب و کوچک شدن دایره زندگی منجر می‌شود. انتخاب یک اقدام کوچک هم‌راستا با ارزش‌های واقعی — حتی در حضور تردید — هسته اصلی انعطاف‌پذیری روانی است.",
            ],
          },
        ],
      },
      {
        slug: "migration-grief-and-belonging",
        title: "سوگ خاموش مهاجرت و بازسازی احساس تعلق در سال‌های نخست",
        excerpt:
          "مهاجرت تنها تغییر جغرافیا نیست؛ سوگواری هم‌زمان برای زبان، نقش‌های اجتماعی و ریشه‌های عاطفی است. شناخت این سوگ طبیعی، مسیر سازگاری را هموارتر می‌کند.",
        coverImageUrl: "/images/blog-diaspora.jpg",
        publishedAtJalali: "۲۸ آبان ۱۴۰۵",
        publishedAtIso: "2026-11-19T09:00:00Z",
        readingMinutes: 5,
        status: "published",
        seoTitle: "سوگ مهاجرت و سازگاری روانی ایرانیان خارج از کشور | دکتر سارا احمدی",
        seoDescription:
          "بررسی نشانه‌های سوگ پنهان پس از مهاجرت و راهکارهای علمی بازسازی حس تعلق و امنیت عاطفی.",
        sections: [
          {
            headingId: "invisible-loss",
            headingText: "چرا سوگ مهاجرت اغلب نادیده گرفته می‌شود؟",
            level: 2,
            paragraphs: [
              "وقتی مهاجرت به انتخاب خود فرد و برای آینده بهتر انجام شده باشد، بسیاری از افراد به خود اجازه نمی‌دهند غمگین باشند. اطرافیان نیز معمولاً انتظار دارند فرد پیوسته قدردان فرصت جدید باشد.",
              "با این حال، از دست دادن صداهای آشنا، شبکه حمایتی خانواده و جایگاه حرفه‌ای پیشین نوعی فقدان واقعی است که اگر به رسمیت شناخته نشود، به شکل خستگی مزمن یا بی‌حوصلگی در روابط بروز می‌کند.",
            ],
          },
          {
            headingId: "rebuilding-roots",
            headingText: "ساختن ریشه‌های تازه بدون قطع پیوند با گذشته",
            level: 2,
            paragraphs: [
              "سازگاری سالم به معنای فراموش کردن هویت پیشین نیست؛ بلکه یافتن زبانی برای پیوند زدن ارزش‌های قبلی با واقعیت امروز است. حفظ روتین‌های کوچک فرهنگی در کنار ساختن روابط معنادار در محیط جدید، فشار روانی تنهایی را تعدیل می‌کند.",
            ],
          },
        ],
      },
      {
        slug: "couples-repair-after-conflict",
        title: "چطور پس از یک مشاجره سخت، پیوند عاطفی رابطه را ترمیم کنیم؟",
        excerpt:
          "اختلاف نظر در هر رابطه‌ای طبیعی است؛ آنچه سلامت رابطه را تعیین می‌کند نبودِ تعارض نیست، بلکه چگونگی بازگشت زوجین به گفتگوی امن پس از تنش است.",
        coverImageUrl: "/images/blog-couples.jpg",
        publishedAtJalali: "۱۹ آبان ۱۴۰۵",
        publishedAtIso: "2026-11-10T09:00:00Z",
        readingMinutes: 7,
        status: "published",
        seoTitle: "ترمیم رابطه زوجین پس از تعارض با رویکرد EFT | دکتر سارا احمدی",
        seoDescription:
          "آموزش گام‌های گفتگوی ترمیمی برای زوج‌ها بر پایه زوج‌درمانی هیجان‌مدار.",
        sections: [
          {
            headingId: "beyond-blame-cycle",
            headingText: "شناسایی چرخه «انتقاد و عقب‌نشینی»",
            level: 2,
            paragraphs: [
              "در بسیاری از زوج‌ها، یک نفر با صدای بلندتر به دنبال دیده شدن است و نفر دیگر برای جلوگیری از انفجار بحث سکوت می‌کند. در این وضعیت، مشکل اصلی نه موضوع مالی یا خانوادگی، بلکه خودِ این چرخه تکراری است.",
            ],
          },
          {
            headingId: "soft-repair-attempt",
            headingText: "زبان نیاز عاطفی به جای زبان قضاوت",
            level: 2,
            paragraphs: [
              "وقتی پس از آرام شدن هیجان اولیه بتوانیم به جای «تو هیچ‌وقت گوش نمی‌دهی» بگوییم «وقتی میان حرفم سکوت می‌کنی احساس تنهایی می‌کنم»، درِ شنیدن برای شریک عاطفی باز می‌شود.",
            ],
          },
        ],
      },
    ],
    weeklySchedule: SARA_WEEKLY_SCHEDULE,
    jalaliOverrides: SARA_OVERRIDES,
  },
  {
    id: "th-kaveh-rezaei",
    slug: "dr-kaveh-rezaei",
    displayName: "دکتر کاوه رضایی",
    subtitle: "روان‌درمانگر تحلیلی و مشاور فردی",
    licenseNumber: "۲۱۶۴۰",
    licenseAuthority: "سازمان نظام روانشناسی و مشاوره",
    experienceYears: 9,
    sessionsHeldLabel: "۲٬۹۰۰+ جلسه",
    avatarUrl: "/images/therapist-kaveh.jpg",
    directoryOptIn: true,
    customDomain: null,
    customDomainVerified: false,
    bio: "روان‌درمانگر فردی با تمرکز بر طرحواره‌درمانی و ریشه‌یابی الگوهای تکراری در روابط بین‌فردی، افسردگی مزمن و بحران‌های هویتی بزرگسالی.",
    approachSummary:
      "ترکیب طرحواره‌درمانی و روان‌درمانی پویشی برای شناسایی ریشه‌های هیجانی و تقویت بخش بالغ سالم.",
    focusAreas: [
      "طرحواره‌درمانی",
      "افسردگی و بی‌انگیزگی",
      "روابط بین‌فردی",
      "اضطراب اجتماعی",
      "هویت و معنای زندگی",
    ],
    reviewsEnabled: true,
    educationTimeline: [
      {
        id: "k-edu-1",
        periodJalali: "۱۳۹۶–۱۴۰۰",
        degree: "دکترای تخصصی روان‌شناسی سلامت",
        institution: "دانشگاه علامه طباطبائی",
      },
      {
        id: "k-edu-2",
        periodJalali: "۱۳۹۲–۱۳۹۶",
        degree: "کارشناسی ارشد روان‌شناسی عمومی",
        institution: "دانشگاه شیراز",
      },
    ],
    reflections: [
      {
        id: "k-rev-1",
        clientLabel: "مراجع فردی · آبان ۱۴۰۵",
        rating: 5,
        comment:
          "نگاه دقیق و صبورانه دکتر رضایی به من کمک کرد ریشه کمال‌گرایی فرساینده خود را بشناسم و با خودشفقتی بیشتری عمل کنم.",
        dateJalali: "۱۵ آبان ۱۴۰۵",
      },
    ],
    offerings: [
      {
        id: "svc-kaveh-ir-ind",
        title: "جلسه طرحواره‌درمانی فردی",
        description: "بررسی عمیق تله‌های زندگی و الگوهای رابطه‌ای در فضای آنلاین",
        track: "iran",
        durationMinutes: 50,
        priceAmount: 1_050_000,
        currency: "IRT",
      },
      {
        id: "svc-kaveh-ab-ind",
        title: "Individual Schema Therapy (Online)",
        description: "جلسه ۵۰ دقیقه‌ای روان‌درمانی فردی برای مراجعان خارج از کشور",
        track: "abroad",
        durationMinutes: 50,
        priceAmount: 3500,
        currency: "USD",
      },
    ],
    blogPosts: [
      {
        slug: "perfectionism-and-emotional-fatigue",
        title: "کمال‌گرایی فرساینده؛ وقتی معیارهای سخت‌گیرانه انگیزه را می‌بلعند",
        excerpt:
          "تفاوت میان تلاش سالم و تله کمال‌گرایی در چیست و چگونه می‌توانیم بدون افت کیفیت زندگی، صدای منتقد درونی را آرام کنیم؟",
        coverImageUrl: "/images/blog-anxiety.jpg",
        publishedAtJalali: "۲ آذر ۱۴۰۵",
        publishedAtIso: "2026-11-23T09:00:00Z",
        readingMinutes: 5,
        status: "published",
        seoTitle: "درمان کمال‌گرایی و منتقد درونی | دکتر کاوه رضایی",
        seoDescription:
          "نگاهی طرحواره‌درمانی به تله معیارهای سرسختانه و راه‌های بازگرداندن تعادل به زندگی.",
        sections: [
          {
            headingId: "healthy-vs-harsh",
            headingText: "مرز باریک میان پیشرفت سالم و استانداردهای غیرممکن",
            level: 2,
            paragraphs: [
              "تلاش برای کیفیت بالا زمانی ارزشمند است که رضایت پس از انجام کار را تجربه کنیم؛ اما در کمال‌گرایی بالینی، ارزش انسانی فرد به طور کامل به بی‌نقص بودن نتیجه گره می‌خورد.",
            ],
          },
          {
            headingId: "softening-inner-critic",
            headingText: "گفتگو با صدای منتقد درونی",
            level: 2,
            paragraphs: [
              "شناخت منشاء تاریخی این صدا و آزمایش کردن استانداردهای واقع‌بینانه‌تر در کارهای روزمره، نخستین گام‌های تغییر پایدار هستند.",
            ],
          },
        ],
      },
    ],
    weeklySchedule: SARA_WEEKLY_SCHEDULE,
    jalaliOverrides: [],
  },
  {
    id: "th-mina-farhadi",
    slug: "dr-mina-farhadi",
    displayName: "دکتر مینا فرهادی",
    subtitle: "متخصص مشاوره خانواده، کودک و نوجوان",
    licenseNumber: "۱۸۳۰۵",
    licenseAuthority: "سازمان نظام روانشناسی و مشاوره",
    experienceYears: 10,
    sessionsHeldLabel: "۳٬۵۰۰+ جلسه",
    avatarUrl: "/images/therapist-mina.jpg",
    directoryOptIn: true,
    customDomain: null,
    customDomainVerified: false,
    bio: "مشاور خانواده و نوجوان با رویکرد سیستمی؛ همراه والدین در فرزندپروری آگاهانه، مدیریت اضطراب نوجوانان و مشاوره پیش از ازدواج برای زوج‌های جوان.",
    approachSummary:
      "خانواده‌درمانی سیستمی و آموزش مهارت‌های ارتباطی والد–نوجوان بر پایه دلبستگی ایمن.",
    focusAreas: [
      "فرزندپروری آگاهانه",
      "اضطراب نوجوانان",
      "مشاوره پیش از ازدواج",
      "تعامل خانواده",
      "بازگشت به تعادل",
    ],
    reviewsEnabled: true,
    educationTimeline: [
      {
        id: "m-edu-1",
        periodJalali: "۱۳۹۴–۱۳۹۸",
        degree: "دکترای مشاوره خانواده",
        institution: "دانشگاه خوارزمی",
      },
      {
        id: "m-edu-2",
        periodJalali: "۱۳۹۰–۱۳۹۴",
        degree: "کارشناسی ارشد روان‌شناسی تربیتی",
        institution: "دانشگاه الزهرا",
      },
    ],
    reflections: [
      {
        id: "m-rev-1",
        clientLabel: "والد نوجوان · مهر ۱۴۰۵",
        rating: 5,
        comment:
          "راهنمایی‌های کاربردی خانم دکتر فرهادی تنش‌های روزانه خانه ما با فرزند نوجوان‌مان را به گفتگوی آرام تبدیل کرد.",
        dateJalali: "۲۹ مهر ۱۴۰۵",
      },
    ],
    offerings: [
      {
        id: "svc-mina-ir-fam",
        title: "مشاوره آنلاین خانواده و فرزندپروری",
        description: "جلسه ۵۰ دقیقه‌ای راهنمایی والدین و مدیریت تعامل با کودک و نوجوان",
        track: "iran",
        durationMinutes: 50,
        priceAmount: 980_000,
        currency: "IRT",
      },
      {
        id: "svc-mina-ab-fam",
        title: "Family & Parenting Consultation (Online)",
        description: "جلسه آنلاین تخصصی ویژه خانواده‌های ایرانی مقیم اروپا و سایر کشورها",
        track: "abroad",
        durationMinutes: 50,
        priceAmount: 3800,
        currency: "EUR",
      },
    ],
    blogPosts: [
      {
        slug: "listening-to-teens-without-lecturing",
        title: "گوش دادن بدون نصیحت؛ کلید حفظ ارتباط عاطفی با نوجوانان",
        excerpt:
          "چرا نوجوانان در برابر پندهای مستقیم مقاومت می‌کنند و چگونه می‌توانیم بدون از دست دادن مرزهای تربیتی، شنونده امن آن‌ها باشیم؟",
        coverImageUrl: "/images/blog-couples.jpg",
        publishedAtJalali: "۲۵ آبان ۱۴۰۵",
        publishedAtIso: "2026-11-16T09:00:00Z",
        readingMinutes: 5,
        status: "published",
        seoTitle: "ارتباط سالم با نوجوانان و فرزندپروری آگاهانه | دکتر مینا فرهادی",
        seoDescription:
          "اصول گوش دادن همدلانه به نوجوانان برای والدین در رویکرد خانواده‌درمانی سیستمی.",
        sections: [
          {
            headingId: "validation-first",
            headingText: "نخست شنیدن احساس، سپس گفتگو درباره راه‌حل",
            level: 2,
            paragraphs: [
              "بیشتر والدین از سر دلسوزی بلافاصله پس از شنیدن مشکل نوجوان، فهرستی از راه‌حل‌ها را ارائه می‌دهند؛ در حالی که نوجوان پیش از راه‌حل، نیازمند آن است که ببیند هیجانش جدی گرفته شده است.",
            ],
          },
        ],
      },
    ],
    weeklySchedule: SARA_WEEKLY_SCHEDULE,
    jalaliOverrides: [],
  },
  {
    id: "th-omid-nikzad",
    slug: "dr-omid-nikzad",
    displayName: "دکتر امید نیک‌زاد",
    subtitle: "روانشناس سلامت و مدیریت استرس",
    licenseNumber: "۲۵۰۱۲",
    licenseAuthority: "سازمان نظام روانشناسی و مشاوره",
    experienceYears: 8,
    sessionsHeldLabel: "۲٬۱۰۰+ جلسه",
    avatarUrl: "/images/therapist-omid.svg",
    directoryOptIn: false, // Omitted from /therapists directory; accessible directly at /dr-omid-nikzad
    customDomain: null,
    customDomainVerified: false,
    bio: "روان‌شناس سلامت با تمرکز بر کاهش استرس مزمن، اختلالات خواب ناشی از فشار شغلی و بازتوانی هیجانی مراجعان.",
    approachSummary:
      "درمان شناختی‌رفتاری بی‌خوابی (CBT-I) و مداخلات ذهن‌آگاهی بالینی برای تنظیم فشار روانی.",
    focusAreas: [
      "مدیریت استرس مزمن",
      "بهداشت خواب",
      "فرسودگی شغلی",
      "تنظیم هیجان",
    ],
    reviewsEnabled: false,
    educationTimeline: [
      {
        id: "o-edu-1",
        periodJalali: "۱۳۹۷–۱۴۰۱",
        degree: "دکترای روان‌شناسی سلامت",
        institution: "دانشگاه علوم بهزیستی و توانبخشی",
      },
    ],
    reflections: [],
    offerings: [
      {
        id: "svc-omid-ir-ind",
        title: "مشاوره تخصصی استرس و خواب",
        description: "جلسه ۵۰ دقیقه‌ای آنلاین برای بهبود کیفیت خواب و مدیریت فشار شغلی",
        track: "iran",
        durationMinutes: 50,
        priceAmount: 950_000,
        currency: "IRT",
      },
      {
        id: "svc-omid-ab-ind",
        title: "Stress & Sleep Therapy (Online)",
        description: "جلسه ۵۰ دقیقه‌ای آنلاین برای مراجعان خارج از کشور",
        track: "abroad",
        durationMinutes: 50,
        priceAmount: 3400,
        currency: "USD",
      },
    ],
    blogPosts: [
      {
        slug: "cbt-i-sleep-reset",
        title: "اصول درمان شناختی‌رفتاری بی‌خوابی بدون وابستگی دارویی",
        excerpt:
          "چگونه عادت‌های بیداری شبانه ذهن را بازتنظیم کنیم و چرخه طبیعی خواب را بازیابی نماییم.",
        coverImageUrl: "/images/blog-anxiety.jpg",
        publishedAtJalali: "۱۰ آبان ۱۴۰۵",
        publishedAtIso: "2026-11-01T09:00:00Z",
        readingMinutes: 4,
        status: "published",
        seoTitle: "بهبود بی‌خوابی با روش CBT-I | دکتر امید نیک‌زاد",
        seoDescription: "آشنایی با گام‌های کلیدی بهداشت خواب و بازسازی ریتم شبانه‌روزی.",
        sections: [
          {
            headingId: "sleep-window",
            headingText: "پیوند دوباره تخت‌خواب با آرامش و خواب",
            level: 2,
            paragraphs: [
              "ماندن طولانی‌مدت در رختخواب با ذهن نگران باعث می‌شود مغز تخت را با هوشیاری و اضطراب شرطی کند. تنظیم ساعت ثابت بیداری یکی از موثرترین ابزارهای بازیابی خواب است.",
            ],
          },
        ],
      },
    ],
    weeklySchedule: SARA_WEEKLY_SCHEDULE,
    jalaliOverrides: [],
  },
];

const PAYMENT_ACCOUNTS_BY_SLUG: Record<string, TherapistPaymentAccounts> = {
  "dr-sara-ahmadi": {
    iran: {
      bankName: "بانک سامان",
      accountHolder: "دکتر سارا احمدی",
      cardPan: "6219-8610-5314-9921",
      sheba: "IR420560611828004192837401",
    },
    abroad: {
      paypal: {
        email: "sessions@sara-ahmadi-clinic.example",
        holderName: "Sara Ahmadi Therapy Practice",
      },
      iban: {
        bankName: "Commerzbank (Germany)",
        iban: "DE89 3704 0044 0532 0130 00",
        bic: "COBADEFFXXX",
        holderName: "Sara Ahmadi",
      },
      usdt: {
        network: "TRC-20 (TRON)",
        address: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE",
      },
    },
  },
  "dr-kaveh-rezaei": {
    iran: {
      bankName: "بانک ملت",
      accountHolder: "دکتر کاوه رضایی",
      cardPan: "6104-3378-9102-4418",
      sheba: "IR190120000000849201745602",
    },
    abroad: {
      paypal: {
        email: "booking@kaveh-rezaei.example",
        holderName: "Kaveh Rezaei",
      },
      iban: {
        bankName: "ING Bank (Netherlands)",
        iban: "NL91 ABNA 0417 1643 00",
        bic: "ABNANL2A",
        holderName: "Kaveh Rezaei",
      },
      usdt: {
        network: "TRC-20 (TRON)",
        address: "TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS",
      },
    },
  },
  "dr-mina-farhadi": {
    iran: {
      bankName: "بانک پاسارگاد",
      accountHolder: "دکتر مینا فرهادی",
      cardPan: "5022-2910-7745-1903",
      sheba: "IR630570028480011294857101",
    },
    abroad: {
      iban: {
        bankName: "Deutsche Bank",
        iban: "DE44 5001 0517 5407 3249 31",
        bic: "DEUTDEFFXXX",
        holderName: "Mina Farhadi",
      },
      paypal: {
        email: "care@mina-farhadi.example",
        holderName: "Mina Farhadi",
      },
    },
  },
  "dr-omid-nikzad": {
    iran: {
      bankName: "بانک پارسیان",
      accountHolder: "دکتر امید نیک‌زاد",
      cardPan: "6221-0612-3048-8715",
      sheba: "IR780540105180029481023901",
    },
    abroad: {
      usdt: {
        network: "TRC-20 (TRON)",
        address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
      },
      paypal: {
        email: "sessions@omid-nikzad.example",
        holderName: "Omid Nikzad",
      },
    },
  },
};

/**
 * Payment destinations are intentionally separated from public catalog data
 * and returned ONLY after Step 3 OTP verification + held booking creation.
 */
export function getPaymentAccountsForHeldBooking(
  slug: string,
): TherapistPaymentAccounts {
  return (
    PAYMENT_ACCOUNTS_BY_SLUG[slug] ?? PAYMENT_ACCOUNTS_BY_SLUG["dr-sara-ahmadi"]
  );
}

const DEFAULT_CALL_JOIN_URL_BY_SLUG: Record<string, string> = {
  "dr-sara-ahmadi": "https://meet.google.com/ravan-sara-101",
  "dr-kaveh-rezaei": "https://meet.google.com/ravan-kaveh-205",
  "dr-mina-farhadi": "https://meet.google.com/ravan-mina-302",
  "dr-omid-nikzad": "https://meet.google.com/ravan-omid-401",
};

/**
 * Default video-call room links are strictly dashboard-only and never serialized
 * into public catalog, directory, blog, or unauthenticated booking payloads.
 */
export function getDefaultCallJoinUrlForTherapist(slug: string): string {
  return (
    DEFAULT_CALL_JOIN_URL_BY_SLUG[slug] ??
    DEFAULT_CALL_JOIN_URL_BY_SLUG["dr-sara-ahmadi"]
  );
}

export function getTherapistBySlug(slug: string): TherapistProfile | undefined {
  return THERAPISTS.find((t) => t.slug === slug);
}

export function getTherapistAvatarBySlug(slug: string): string {
  return getTherapistBySlug(slug)?.avatarUrl ?? "/images/therapist-sara.jpg";
}

export function getDirectoryTherapists(): TherapistProfile[] {
  return THERAPISTS.filter((t) => t.directoryOptIn);
}

export function getBlogPostForTherapist(
  slug: string,
  postSlug: string,
): { therapist: TherapistProfile; post: BlogPost } | undefined {
  const therapist = getTherapistBySlug(slug);
  if (!therapist) return undefined;
  const post = therapist.blogPosts.find(
    (p) => p.slug === postSlug && p.status === "published",
  );
  if (!post) return undefined;
  return { therapist, post };
}

/**
 * Deterministic slot generation anchored in Azar/Dey 1405 (Nov/Dec 2026)
 * respecting Saturday-first weekly windows & Jalali overrides.
 * Includes 11:00Z (= 12:00 Europe/Berlin, 14:30 Asia/Tehran) for Track B dual-time accuracy.
 */
const TEHRAN_STANDARD_TIMES: readonly { hour: number; minute: number; labelFa: string }[] = [
  { hour: 10, minute: 0, labelFa: "۱۰:۰۰" },
  { hour: 11, minute: 30, labelFa: "۱۱:۳۰" },
  { hour: 14, minute: 30, labelFa: "۱۴:۳۰" },
  { hour: 16, minute: 0, labelFa: "۱۶:۰۰" },
  { hour: 17, minute: 30, labelFa: "۱۷:۳۰" },
  { hour: 19, minute: 0, labelFa: "۱۹:۰۰" },
];

export function generateMockSlotsForTherapist(slug: string): TimeSlotOption[] {
  const therapist = getTherapistBySlug(slug);
  if (!therapist) return [];

  const overridesByJalali = new Map(
    therapist.jalaliOverrides.map((ovr) => [ovr.jalaliKey, ovr]),
  );
  const rulesByWeekday = new Map(
    therapist.weeklySchedule.map((rule) => [rule.weekdaySat0, rule]),
  );

  // Anchor start: 1405-09-07 (2026-11-28 Saturday) for 35 days through early Dey 1405
  const anchorStartUtc = Date.UTC(2026, 10, 28, 0, 0, 0);
  const slots: TimeSlotOption[] = [];

  for (let offsetDay = 0; offsetDay < 35; offsetDay++) {
    const dayUtc = new Date(anchorStartUtc + offsetDay * 86_400_000);
    const gy = dayUtc.getUTCFullYear();
    const gm = dayUtc.getUTCMonth() + 1;
    const gd = dayUtc.getUTCDate();

    const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
    const jalaliKey = formatJalaliKey(jy, jm, jd);
    const wdSat0 = weekdaySat0(gy, gm, gd);

    const override = overridesByJalali.get(jalaliKey);
    if (override?.type === "closed") {
      continue;
    }

    const rule = rulesByWeekday.get(wdSat0);
    if (!override && (!rule || !rule.enabled)) {
      continue;
    }

    const activeTimes =
      override?.type === "custom_hours"
        ? TEHRAN_STANDARD_TIMES.filter((t) => t.hour >= 14 && t.hour <= 18)
        : wdSat0 === 5 // پنج‌شنبه نیمه‌وقت
          ? TEHRAN_STANDARD_TIMES.filter((t) => t.hour >= 11 && t.hour <= 16)
          : TEHRAN_STANDARD_TIMES;

    for (const slotTime of activeTimes) {
      // Tehran standard time in Azar/Dey is UTC+03:30 (210 minutes)
      const tehranTotalMin = slotTime.hour * 60 + slotTime.minute;
      const utcTotalMin = tehranTotalMin - 210;
      const slotUtcMs =
        Date.UTC(gy, gm - 1, gd, 0, 0, 0) + utcTotalMin * 60_000;
      const isoUtc = new Date(slotUtcMs).toISOString();

      slots.push({
        id: `${slug}-${jalaliKey}-${String(slotTime.hour).padStart(2, "0")}${String(slotTime.minute).padStart(2, "0")}`,
        isoUtc,
        tehranJalaliKey: jalaliKey,
        tehranTimeFa: slotTime.labelFa,
        tehranHour: slotTime.hour,
        tehranMinute: slotTime.minute,
      });
    }
  }

  return slots;
}

export function jalaliPartsFromKey(jalaliKey: string): { jy: number; jm: number; jd: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jalaliKey);
  if (!match) return null;
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  const g = jalaliToGregorian(jy, jm, jd);
  if (!g.gy) return null;
  return { jy, jm, jd };
}

export const MOCK_CLIENT_SESSIONS: readonly ClientSessionRecord[] = [
  {
    id: "bk-confirmed-101",
    referenceCode: "RN-4C8E21",
    therapistSlug: "dr-sara-ahmadi",
    therapistName: "دکتر سارا احمدی",
    therapistSubtitle: "روانشناس بالینی و زوج‌درمانگر",
    serviceTitle: "مشاوره فردی آنلاین",
    track: "iran",
    clientTimezone: "Asia/Tehran",
    startIsoUtc: "2026-12-01T14:00:00Z",
    durationMinutes: 50,
    dateTimeJalaliLabel: "سه‌شنبه ۱۱ آذر ۱۴۰۵ · ساعت ۱۷:۳۰ به وقت تهران",
    amount: 1_200_000,
    currency: "IRT",
    status: "confirmed",
    callJoinUrl: "https://meet.google.com/ravan-sara-101",
    trackingCode: "739104285",
  },
  {
    id: "bk-pending-102",
    referenceCode: "RN-7F3A9C",
    therapistSlug: "dr-sara-ahmadi",
    therapistName: "دکتر سارا احمدی",
    therapistSubtitle: "روانشناس بالینی و زوج‌درمانگر",
    serviceTitle: "زوج‌درمانی آنلاین",
    track: "iran",
    clientTimezone: "Asia/Tehran",
    startIsoUtc: "2026-12-03T12:30:00Z",
    durationMinutes: 75,
    dateTimeJalaliLabel: "پنج‌شنبه ۱۳ آذر ۱۴۰۵ · ساعت ۱۶:۰۰ به وقت تهران",
    amount: 1_500_000,
    currency: "IRT",
    status: "pending_verification",
    trackingCode: "482910374",
  },
  {
    id: "bk-rejected-104",
    referenceCode: "RN-9A1B4D",
    therapistSlug: "dr-sara-ahmadi",
    therapistName: "دکتر سارا احمدی",
    therapistSubtitle: "روانشناس بالینی و زوج‌درمانگر",
    serviceTitle: "مشاوره فردی آنلاین",
    track: "iran",
    clientTimezone: "Asia/Tehran",
    startIsoUtc: "2026-11-29T08:00:00Z",
    durationMinutes: 50,
    dateTimeJalaliLabel: "یکشنبه ۸ آذر ۱۴۰۵ · ساعت ۱۱:۳۰ به وقت تهران",
    amount: 1_200_000,
    currency: "IRT",
    status: "rejected",
    rejectionReason:
      "مبلغ واریزی با تعرفه مصوب مطابقت ندارد و تصویر رسید در بخش تاریخ ناخوانا است",
    trackingCode: "310482911",
    rebookPreset: {
      bookingId: "bk-rejected-104",
      therapistSlug: "dr-sara-ahmadi",
      track: "iran",
      serviceId: "svc-sara-ir-ind",
      clientName: "نگار موسوی",
      phoneDialCode: "+98",
      phoneNational: "9123456789",
      email: "negar.mousavi@example.com",
      note: "پیگیری جلسه قبلی درباره مدیریت اضطراب کاری",
      rejectionReason:
        "مبلغ واریزی با تعرفه مصوب مطابقت ندارد و تصویر رسید در بخش تاریخ ناخوانا است",
    },
  },
  {
    id: "bk-completed-105",
    referenceCode: "RN-2D6H1K",
    therapistSlug: "dr-kaveh-rezaei",
    therapistName: "دکتر کاوه رضایی",
    therapistSubtitle: "روان‌درمانگر تحلیلی و مشاور فردی",
    serviceTitle: "جلسه طرحواره‌درمانی فردی",
    track: "iran",
    clientTimezone: "Asia/Tehran",
    startIsoUtc: "2026-11-23T12:30:00Z",
    durationMinutes: 50,
    dateTimeJalaliLabel: "دوشنبه ۳ آذر ۱۴۰۵ · ساعت ۱۶:۰۰ به وقت تهران",
    amount: 1_050_000,
    currency: "IRT",
    status: "completed",
    callJoinUrl: "https://meet.google.com/ravan-kaveh-205",
    hasReview: false,
  },
];

export function getRebookPresetById(bookingId: string): RebookPreset | undefined {
  return MOCK_CLIENT_SESSIONS.find((s) => s.id === bookingId)?.rebookPreset;
}

export const MOCK_DASHBOARD_BOOKINGS: readonly DashboardBookingRecord[] = [
  {
    id: "dash-pending-1",
    referenceCode: "RN-7F3A9C",
    clientName: "نیلوفر کریمی",
    clientContactDisplay: "+98 912 480 3192",
    track: "iran",
    serviceTitle: "مشاوره فردی آنلاین",
    durationMinutes: 50,
    slotLabelJalali: "پنج‌شنبه ۱۳ آذر ۱۴۰۵ · ۱۶:۰۰ تهران",
    amount: 1_200_000,
    currency: "IRT",
    status: "pending_verification",
    trackingCode: "482910374",
    receiptImageUrl: "/images/sample-receipt-card.svg",
    submittedAtJalali: "۶ آذر ۱۴۰۵ · ۱۴:۳۲",
    clientNote: "تجربه تنش شغلی در ماه‌های اخیر و نیاز به راهنمایی تخصصی",
  },
  {
    id: "dash-pending-2",
    referenceCode: "RN-5K2M8P",
    clientName: "آرش محمدی",
    clientContactDisplay: "arash.mohammadi@example.com",
    track: "abroad",
    serviceTitle: "Individual Therapy (Online)",
    durationMinutes: 50,
    slotLabelJalali: "پنج‌شنبه ۱۳ آذر ۱۴۰۵ · ۱۴:۳۰ تهران",
    slotLabelDual: "Thu, Dec 3, 2026 · 12:00 Europe/Berlin",
    amount: 4000,
    currency: "USD",
    status: "pending_verification",
    trackingCode: "PP-903812",
    receiptImageUrl: "/images/sample-receipt-card.svg",
    submittedAtJalali: "۶ آذر ۱۴۰۵ · ۱۵:۱۰",
    clientNote: "ساکن برلین؛ هماهنگی با ساعت اروپا",
  },
  {
    id: "dash-confirmed-1",
    referenceCode: "RN-4C8E21",
    clientName: "سهراب تهرانی",
    clientContactDisplay: "+98 935 712 8405",
    track: "iran",
    serviceTitle: "زوج‌درمانی آنلاین",
    durationMinutes: 75,
    slotLabelJalali: "سه‌شنبه ۱۱ آذر ۱۴۰۵ · ۱۷:۳۰ تهران",
    amount: 1_500_000,
    currency: "IRT",
    status: "confirmed",
    trackingCode: "739104285",
    receiptImageUrl: "/images/sample-receipt-card.svg",
    submittedAtJalali: "۵ آذر ۱۴۰۵ · ۱۱:۱۵",
    callJoinUrl: "https://meet.google.com/ravan-sara-101",
  },
  {
    id: "dash-completed-1",
    referenceCode: "RN-1E9W3Q",
    clientName: "مریم حسینی",
    clientContactDisplay: "+98 919 205 6630",
    track: "iran",
    serviceTitle: "مشاوره فردی آنلاین",
    durationMinutes: 50,
    slotLabelJalali: "دوشنبه ۳ آذر ۱۴۰۵ · ۱۶:۰۰ تهران",
    amount: 1_200_000,
    currency: "IRT",
    status: "completed",
    trackingCode: "581029340",
    receiptImageUrl: "/images/sample-receipt-card.svg",
    submittedAtJalali: "۱ آذر ۱۴۰۵ · ۱۰:۰۰",
    callJoinUrl: "https://meet.google.com/ravan-sara-101",
  },
  {
    id: "dash-rejected-1",
    referenceCode: "RN-9A1B4D",
    clientName: "نگار موسوی",
    clientContactDisplay: "+98 912 345 6789",
    track: "iran",
    serviceTitle: "مشاوره فردی آنلاین",
    durationMinutes: 50,
    slotLabelJalali: "یکشنبه ۸ آذر ۱۴۰۵ · ۱۱:۳۰ تهران",
    amount: 1_200_000,
    currency: "IRT",
    status: "rejected",
    trackingCode: "310482911",
    receiptImageUrl: "/images/sample-receipt-card.svg",
    submittedAtJalali: "۴ آذر ۱۴۰۵ · ۱۹:۴۰",
    rejectionReason:
      "مبلغ واریزی با تعرفه مصوب مطابقت ندارد و تصویر رسید در بخش تاریخ ناخوانا است",
  },
];
