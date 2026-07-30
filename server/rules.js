const CATEGORY_RULES = {
  D: {
    code: "D",
    name: "General Purpose Document",
    prefix: "XD",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XD-26-001_GR10X-40K_Risk Management Report_r00"
  },
  R: {
    code: "R",
    name: "Record Purpose Document",
    prefix: "XR",
    suffixType: "date",
    requiresSequence: true,
    implemented: true,
    example: "XR-26-001_R&D_Literature Search Report_20260326"
  },
  MD: {
    code: "MD",
    name: "Manufacturing Dynamic Document",
    prefix: "XMD",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XMD-26-001_GR10X-40K_Product Wastage Follow-up_r00"
  },
  MR: {
    code: "MR",
    name: "Manufacturing Record Document",
    prefix: "XMR",
    suffixType: "date",
    requiresSequence: true,
    implemented: true,
    example: "XMR-26-001_GR10X-40K_Final Inspection Report_20260505"
  },
  EC: {
    code: "EC",
    name: "Engineering Change",
    prefix: "XEC",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XEC-26A-R_GR10X-40K_Critical malfunction of motor_r00"
  },
  QMS: {
    code: "QMS",
    name: "Quality Management",
    prefix: "XQ",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XQP-13_Control of Manufacturing Realization_r00"
  },
  SOP: {
    code: "SOP",
    name: "SOP / Instruction",
    prefix: "XQS",
    suffixType: "revision",
    requiresSequence: true,
    implemented: true,
    example: "XQS-13-01_Soldering_r00"
  },
  MARKETING: {
    code: "MARKETING",
    name: "Marketing Material ID",
    prefix: "XERA",
    suffixType: "marketing",
    requiresSequence: false,
    implemented: true,
    example: "XERA-GR10X-26BR01-ENV1"
  }
};

const REVISION_CATEGORY_CODES = Object.values(CATEGORY_RULES)
  .filter(rule => rule.suffixType === "revision")
  .map(rule => rule.code);

const MARKETING_MATERIAL_TYPES = ["CA", "BR", "LE", "GE"];
const MARKETING_LANGUAGE_CODES = ["EN", "TR", "KR"];
const MARKETING_TYPE_ALIASES = {
  B: "BR",
  C: "CA",
  L: "LE",
  G: "GE"
};

const PART_PROJECTS = [
  { code: "X101", description: "GR10X (Turkey)" },
  { code: "X102", description: "VR10X (Turkey)" },
  { code: "X103", description: "6Way (Turkey)" },
  { code: "X104", description: "Long Format Detector (Turkey)" },
  { code: "X105", description: "GR20X" },
  { code: "X106", description: "Mobile System" },
  { code: "1501", description: "GR10X (Korea)" }
];

const PART_MAIN_CODES = [
  { code: "1", name: "Finished Product" },
  { code: "2", name: "Sheet Metal & Aluminium & Pipe" },
  { code: "3", name: "Plastic & Rubber & Laminate" },
  { code: "4", name: "CNC Machining" },
  { code: "5", name: "Sub Assembly" },
  { code: "6", name: "Firmware" },
  { code: "7", name: "Electric Parts (PCBA, Cable, IC, etc.)" },
  { code: "8", name: "Dummy (Packing, Label, Sticker, Assembly Tools etc.)" },
  { code: "9", name: "Miscellaneous Bolt, Screw, Nut, etc." }
];

const PART_REVISION_MODES = [
  { code: "released", name: "Released Revision", defaultRevision: "01A", pattern: "^\\d{2}[A-Z]$", example: "01A" },
  { code: "design", name: "Design-stage Code", defaultRevision: "D01", pattern: "^D\\d{2}$", example: "D01" },
  { code: "change", name: "Design-change Intermediate Code", defaultRevision: "C01", pattern: "^C\\d{2}$", example: "C01" }
];

const PART_REVISION_REQUEST_TYPES = [
  { code: "minor", name: "Minor Revision" },
  { code: "major", name: "Major Revision" }
];

const PART_PROJECT_CODES = PART_PROJECTS.map(project => project.code);
const PART_MAIN_CODE_MAP = Object.fromEntries(PART_MAIN_CODES.map(mainCode => [mainCode.code, mainCode]));
const PART_REVISION_MODE_MAP = Object.fromEntries(PART_REVISION_MODES.map(mode => [mode.code, mode]));

const USER_ROLES = {
  USER: "user",
  PART_ADMIN: "part_admin",
  DOCUMENT_ADMIN: "document_admin",
  USER_ADMIN: "user_admin",
  ALL_ADMIN: "all_admin"
};

const ADMIN_PERMISSIONS = ["part_admin", "document_admin", "user_admin"];
const ROLE_LABELS = {
  [USER_ROLES.USER]: "User",
  [USER_ROLES.PART_ADMIN]: "Part List Admin",
  [USER_ROLES.DOCUMENT_ADMIN]: "Document List Admin",
  [USER_ROLES.USER_ADMIN]: "User Permissions Admin",
  [USER_ROLES.ALL_ADMIN]: "All Admin"
};
const ROLE_PERMISSIONS = {
  [USER_ROLES.USER]: [],
  [USER_ROLES.PART_ADMIN]: ["part_admin"],
  [USER_ROLES.DOCUMENT_ADMIN]: ["document_admin"],
  [USER_ROLES.USER_ADMIN]: ["user_admin"],
  [USER_ROLES.ALL_ADMIN]: ["part_admin", "document_admin", "user_admin"]
};
const ROLE_CHECK_SQL = "'user', 'part_admin', 'document_admin', 'user_admin', 'all_admin'";

module.exports = {
  CATEGORY_RULES,
  REVISION_CATEGORY_CODES,
  MARKETING_MATERIAL_TYPES,
  MARKETING_LANGUAGE_CODES,
  MARKETING_TYPE_ALIASES,
  PART_PROJECTS,
  PART_MAIN_CODES,
  PART_REVISION_MODES,
  PART_REVISION_REQUEST_TYPES,
  PART_PROJECT_CODES,
  PART_MAIN_CODE_MAP,
  PART_REVISION_MODE_MAP,
  USER_ROLES,
  ADMIN_PERMISSIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLE_CHECK_SQL
};
