import assert from "node:assert/strict";
import test from "node:test";
import { classifyAssessmentText, detectNegationAndQualifiers, extractClinicalImpression, matchPhilippineSynonym } from "../src/clinical-nlp-classifier.ts";

test("extracts multiline assessment text", () => assert.equal(extractClinicalImpression("S: cough\nA: T/C Dengue\nwith warning signs\nP: hydrate"), "T/C Dengue with warning signs"));
test("qualifies suspected dengue", () => { const result = classifyAssessmentText("T/C Dengue with warning signs"); assert.equal(result?.icd10Code, "A90"); assert.equal(result?.provisional, true); });
test("scopes negation to dengue clause", () => { const result = classifyAssessmentText("Patient has cough, but negative for Dengue"); assert.equal(result, null); assert.deepEqual(detectNegationAndQualifiers("Patient has cough, but negative for Dengue").negatedTerms, ["Dengue"]); });
test("shields mental health diagnoses", () => { const result = classifyAssessmentText("Major depressive disorder with suicidal ideation"); assert.equal(result?.isSensitive, true); assert.equal(result?.sensitiveCategory, "mental_health"); assert.equal(result?.icd10Code, null); });
test("matches PCAP suffix", () => assert.equal(matchPhilippineSynonym("Pedia PCAP-C")?.icd10Code, "J18.9"));
test("handles HIV, empty input, and mixed case", () => { assert.equal(classifyAssessmentText("HIV positive")?.isSensitive, true); assert.equal(classifyAssessmentText(null), null); assert.equal(classifyAssessmentText("pEdIa pCaP-c")?.icd10Code, "J18.9"); });
test("distinguishes R/O from confirmed", () => { assert.equal(classifyAssessmentText("R/O Dengue"), null); assert.equal(classifyAssessmentText("confirmed Dengue")?.icd10Code, "A90"); });
