function sanitizeEmail(value) {
  return String(value || "").toLowerCase().trim();
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function sanitizeCandidateProfile(profile = {}) {
  return {
    phoneNumber: sanitizeText(profile.phoneNumber),
    cnic: sanitizeText(profile.cnic),
    maritalStatus: sanitizeText(profile.maritalStatus),
    qualification: sanitizeText(profile.qualification),
    dateOfBirth: sanitizeText(profile.dateOfBirth),
    positionAppliedFor: sanitizeText(profile.positionAppliedFor),
    residentialAddress: sanitizeText(profile.residentialAddress),
    workExperience: sanitizeText(profile.workExperience),
    startDate: sanitizeText(profile.startDate),
    endDate: sanitizeText(profile.endDate),
    currentSalary: sanitizeText(profile.currentSalary),
    expectedSalary: sanitizeText(profile.expectedSalary),
    expectedJoiningDate: sanitizeText(profile.expectedJoiningDate),
    shiftComfortable: sanitizeText(profile.shiftComfortable),
  };
}

function validateRequiredCandidateProfile(candidateName, profile) {
  const requiredChecks = [
    ["fullName", sanitizeText(candidateName)],
    ["phoneNumber", sanitizeText(profile.phoneNumber)],
    ["cnic", sanitizeText(profile.cnic)],
    ["maritalStatus", sanitizeText(profile.maritalStatus)],
    ["qualification", sanitizeText(profile.qualification)],
    ["dateOfBirth", sanitizeText(profile.dateOfBirth)],
    ["positionAppliedFor", sanitizeText(profile.positionAppliedFor)],
    ["residentialAddress", sanitizeText(profile.residentialAddress)],
    ["workExperience", sanitizeText(profile.workExperience)],
    ["startDate", sanitizeText(profile.startDate)],
    ["endDate", sanitizeText(profile.endDate)],
    ["currentSalary", sanitizeText(profile.currentSalary)],
    ["expectedSalary", sanitizeText(profile.expectedSalary)],
    ["expectedJoiningDate", sanitizeText(profile.expectedJoiningDate)],
    ["shiftComfortable", sanitizeText(profile.shiftComfortable)],
  ];
  return requiredChecks.filter(([, value]) => !value).map(([key]) => key);
}

function isAlphabetOnly(value) {
  return /^[A-Za-z\s]+$/.test(String(value || "").trim());
}

function isValidDateInput(value) {
  const v = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}\/\d{2}\/\d{4}$/.test(v);
}

function validateCandidateProfileFormats(candidateEmail, candidateName, profile) {
  const errors = [];
  const email = sanitizeEmail(candidateEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid Email Address format");
  if (!isAlphabetOnly(candidateName)) errors.push("Full Name must contain only alphabets");
  if (!/^\+92\d{10}$/.test(String(profile.phoneNumber || "").trim())) {
    errors.push("Phone Number must be +92 followed by 10 digits");
  }
  if (!/^\d{5}-\d{7}-\d$/.test(String(profile.cnic || "").trim())) {
    errors.push("Cnic Num must be in 12345-1234567-1 format");
  }
  if (!["single", "married"].includes(String(profile.maritalStatus || "").trim().toLowerCase())) {
    errors.push("Marital Status must be Single or Married");
  }
  if (!isAlphabetOnly(profile.positionAppliedFor)) errors.push("Position Applied For must contain only alphabets");
  if (!isAlphabetOnly(profile.workExperience)) errors.push("Work Experience must contain only alphabets");
  if (!isValidDateInput(profile.dateOfBirth)) errors.push("Date of Birth format is invalid");
  if (!isValidDateInput(profile.startDate)) errors.push("Start Date format is invalid");
  if (!isValidDateInput(profile.endDate)) errors.push("End Date format is invalid");
  if (!isValidDateInput(profile.expectedJoiningDate)) errors.push("Expected Date of Joining format is invalid");
  if (!["yes", "no"].includes(String(profile.shiftComfortable || "").trim().toLowerCase())) {
    errors.push("Comfortable with 9 AM-6 PM shift? must be Yes or No");
  }
  return errors;
}

function isValidMcqAnswers(mcqAnswers) {
  if (!Array.isArray(mcqAnswers)) return false;
  return mcqAnswers.every((item) => Number.isInteger(item?.questionIndex) && item.questionIndex >= 0
      && Number.isInteger(item?.selectedOptionIndex)
      && item.selectedOptionIndex >= 0
      && item.selectedOptionIndex <= 3);
}

function isValidCodingAnswers(codingAnswers) {
  if (!Array.isArray(codingAnswers)) return false;
  return codingAnswers.every((item) => Number.isInteger(item?.taskIndex) && item.taskIndex >= 0
      && typeof item?.code === "string"
      && typeof item?.language === "string"
      && String(item.language).trim().length > 0);
}

module.exports = {
  sanitizeEmail,
  sanitizeText,
  sanitizeCandidateProfile,
  validateRequiredCandidateProfile,
  validateCandidateProfileFormats,
  isValidMcqAnswers,
  isValidCodingAnswers,
};

