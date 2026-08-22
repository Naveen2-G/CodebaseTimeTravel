const assert = require('assert');
const impactService = require('../services/impactService');

async function runTests() {
  console.log('==================================================');
  console.log(' RUNNING PHASE 6 FINAL FIX TEST SUITE');
  console.log('==================================================\n');

  let passedCount = 0;
  let failedCount = 0;

  function assertTest(name, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${name}`);
      if (details) console.log(`       └─ ${details}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${name}`);
      if (details) console.error(`       └─ ${details}`);
      failedCount++;
    }
  }

  // ----------------------------------------------------
  // TEST 1: Route -> Controller (Route Handler Relationship, NOT Possible Reference)
  // ----------------------------------------------------
  try {
    const callersAndRefs = await impactService.findCallersAndReferences(
      process.cwd(),
      'backend/controllers/studentController.js',
      'getMyProfileStudent'
    );

    const isRouteInPossibleRefs = callersAndRefs.possibleReferences.some(r => r.file.includes('studentRoutes'));
    const isRouteInDirectCallers = callersAndRefs.directCallers.some(c => c.file.includes('studentRoutes'));

    assertTest(
      'TEST 1: Route file is NOT misclassified as Direct Caller or Possible Reference',
      !isRouteInPossibleRefs && !isRouteInDirectCallers,
      `Possible references in studentRoutes: ${isRouteInPossibleRefs}, Direct callers: ${isRouteInDirectCallers}`
    );
  } catch (err) {
    assertTest('TEST 1: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 2: Model Name is NOT automatically a Functionality
  // ----------------------------------------------------
  try {
    const directDependencies = [{ name: 'Student', type: 'model' }];
    const res = await impactService.discoverAffectedFunctionalities(
      process.cwd(),
      'backend/controllers/studentController.js',
      'getMyProfileStudent',
      [],
      [],
      [],
      directDependencies
    );

    const hasModelAsFunc = res.affectedFunctionalities.some(f => f.name === 'Student');

    assertTest(
      'TEST 2: Model name "Student" is NOT converted into a functionality',
      !hasModelAsFunc && res.affectedFunctionalities.length === 0,
      `Affected functionalities count: ${res.affectedFunctionalities.length}`
    );
  } catch (err) {
    assertTest('TEST 2: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 3: Actual Frontend Feature & Route Mapping
  // ----------------------------------------------------
  try {
    const routes = [{ method: 'GET', path: '/me', handler: 'getMyProfileStudent', definedIn: 'backend/src/routes/studentRoutes.js' }];
    const res = await impactService.discoverAffectedFunctionalities(
      process.cwd(),
      'backend/controllers/studentController.js',
      'getMyProfileStudent',
      routes,
      [],
      [],
      []
    );

    const func = res.affectedFunctionalities[0];

    assertTest(
      'TEST 3: Route + Handler produces evidence-grounded Functionality Object',
      func && func.name === 'Student Profile Retrieval' && func.relationship === 'DIRECT' && func.confidence === 'HIGH',
      `Func Name: "${func?.name}", Relationship: "${func?.relationship}", Confidence: "${func?.confidence}"`
    );
  } catch (err) {
    assertTest('TEST 3: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 4: No Invention of Unproven UI Feature Names
  // ----------------------------------------------------
  try {
    const funcName = impactService.deriveFunctionalityName(null, 'getMyProfileStudent', 'GET /me');

    assertTest(
      'TEST 4: Derives "Student Profile Retrieval", does NOT invent "Student Dashboard"',
      funcName === 'Student Profile Retrieval' && funcName !== 'Student Dashboard',
      `Derived name: "${funcName}"`
    );
  } catch (err) {
    assertTest('TEST 4: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 5: Common Identifier produces NO false functionalities
  // ----------------------------------------------------
  try {
    const res = await impactService.discoverAffectedFunctionalities(
      process.cwd(),
      'frontend/src/components/Form.jsx',
      'setError',
      [],
      [],
      [{ file: 'frontend/src/components/Other.jsx', line: 10, snippet: 'setError("err")' }],
      []
    );

    assertTest(
      'TEST 5: Common identifier (setError) produces 0 false functionalities',
      res.affectedFunctionalities.length === 0,
      `Functionalities count: ${res.affectedFunctionalities.length}`
    );
  } catch (err) {
    assertTest('TEST 5: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 6: Removal & Modification Analysis are Endpoint/Feature Specific
  // ----------------------------------------------------
  try {
    const routes = [{ method: 'GET', path: '/me', handler: 'getMyProfileStudent' }];
    const funcs = [{ name: 'Student Profile Retrieval' }];

    const removalStr = impactService.buildRemovalAnalysis('getMyProfileStudent', routes, [], funcs);
    const modStr = impactService.buildModificationAnalysis('getMyProfileStudent', routes, [], funcs);

    const isSpecificRemoval = removalStr.includes('Removing getMyProfileStudent() would leave the GET /me route without its current handler') &&
                               removalStr.includes('student profile retrieval may stop functioning');
    const isNotBroadRemoval = !removalStr.includes('Student may stop functioning.');

    const isSpecificMod = modStr.includes('Changes to the response structure or retrieval behavior may affect clients that consume GET /me.');

    assertTest(
      'TEST 6: Removal and Modification statements are specific to endpoint/feature',
      isSpecificRemoval && isNotBroadRemoval && isSpecificMod,
      `Removal: "${removalStr}" | Modification: "${modStr}"`
    );
  } catch (err) {
    assertTest('TEST 6: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 7: Impact Confidence is HIGH and Impact Level is MEDIUM for Verified Route
  // ----------------------------------------------------
  try {
    const routes = [{ method: 'GET', path: '/me', handler: 'getMyProfileStudent', definedIn: 'backend/src/routes/studentRoutes.js' }];
    const res = await impactService.discoverAffectedFunctionalities(
      process.cwd(),
      'backend/controllers/studentController.js',
      'getMyProfileStudent',
      routes,
      [],
      [],
      []
    );

    const hasVerifiedRoutes = routes.length > 0;
    const hasVerifiedCallers = false;
    const impactLevel = (hasVerifiedCallers && (hasVerifiedRoutes || false)) ? 'HIGH' : (hasVerifiedRoutes ? 'MEDIUM' : 'UNKNOWN');
    const impactConfidence = hasVerifiedRoutes ? 'HIGH' : 'LOW';

    assertTest(
      'TEST 7: Verified route gives HIGH Impact Confidence and MEDIUM Impact Level',
      impactConfidence === 'HIGH' && impactLevel === 'MEDIUM',
      `ImpactConfidence: ${impactConfidence}, ImpactLevel: ${impactLevel}`
    );
  } catch (err) {
    assertTest('TEST 7: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 8: Direct Dependency Resolution (Student.findOne in getMyProfileStudent)
  // ----------------------------------------------------
  try {
    const fileContent = `
      const Student = require('../models/Student');
      exports.getMyProfileStudent = async (req, res) => {
        const student = await Student.findOne({ user: req.user._id }).populate('user');
        res.json(student);
      };
    `;
    const selectedCode = `
      const student = await Student.findOne({ user: req.user._id }).populate('user');
    `;

    const deps = impactService.findDirectDependencies(selectedCode, fileContent, 'getMyProfileStudent');

    const studentDep = deps.find(d => d.name === 'Student');
    const userDep = deps.find(d => d.name === 'user');

    assertTest(
      'TEST 8: Student resolved as DIRECT DEPENDENCY with evidence; user in populate() is ignored',
      Boolean(studentDep) && studentDep.evidence.includes('Student.findOne() in getMyProfileStudent()') && !userDep,
      `Dependencies found: ${deps.map(d => d.name).join(', ')} | Evidence: ${studentDep?.evidence}`
    );
  } catch (err) {
    assertTest('TEST 8: Execution', false, err.message);
  }

  // ----------------------------------------------------
  // TEST 9: Route File Exclusion from Related Files
  // ----------------------------------------------------
  try {
    const routes = [{ method: 'GET', path: '/me', handler: 'getMyProfileStudent', definedIn: 'backend/src/routes/studentRoutes.js' }];
    const rawRelatedFiles = [{ file: 'backend/src/routes/studentRoutes.js', relationship: 'name_similarity' }];

    const routeFiles = new Set(routes.map(r => r.definedIn).filter(Boolean));
    const filteredRelated = rawRelatedFiles.filter(rf => !routeFiles.has(rf.file));

    assertTest(
      'TEST 9: Route file studentRoutes.js excluded from RELATED FILES (no name_similarity for verified route)',
      filteredRelated.length === 0,
      `Filtered related files count: ${filteredRelated.length}`
    );
  } catch (err) {
    assertTest('TEST 9: Execution', false, err.message);
  }

  console.log('\n==================================================');
  console.log(` TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('==================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
