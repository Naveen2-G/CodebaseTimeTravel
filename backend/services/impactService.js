const fs = require('fs').promises;
const path = require('path');
const repositoryService = require('./repositoryService');
const gitHistoryService = require('./gitHistoryService');

const COMMON_IDENTIFIERS = new Set([
  'setError', 'update', 'handleChange', 'save', 'create', 'delete', 
  'index', 'render', 'submit', 'login', 'data', 'error', 'setLoading', 
  'setSuccess', 'handleClick', 'handleSubmit', 'reset', 'init', 'log', 'parse'
]);

/**
 * Extract symbol (function, class, component, method, route handler) from selected code
 */
function extractSymbol(selectedCode) {
  if (!selectedCode || typeof selectedCode !== 'string') return null;

  const lines = selectedCode.split('\n').map(l => l.trim());

  for (const line of lines) {
    // Route definition handler: router.post('/path', submitPracticeLog) or app.get('/path', handleGet)
    let match = line.match(/(?:router|app)\.(?:get|post|put|delete|patch|use)\(['"][^'"]+['"]\s*,\s*([A-Za-z0-9_$]+)/i);
    if (match && !['async', 'function', 'req', 'res', 'next'].includes(match[1])) return match[1];

    // JS/TS Function declaration: function foo(...) or async function foo(...)
    match = line.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    if (match) return match[1];

    // JS/TS Arrow function or expression: const foo = (...) => or let foo = function
    match = line.match(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/);
    if (match) return match[1];

    // JS/PHP Class method: foo(...) { or public function foo(...) or static foo(...)
    match = line.match(/(?:public|private|protected|static|async)?\s*function\s+([A-Za-z0-9_$]+)\s*\(/);
    if (match) return match[1];

    match = line.match(/(?:public|private|protected|static|async)?\s*([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/);
    if (match && !['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) return match[1];

    // JS/PHP Class definition: class Foo
    match = line.match(/(?:export\s+)?class\s+([A-Za-z0-9_$]+)/);
    if (match) return match[1];

    // Python function / class: def foo(...): or class Foo:
    match = line.match(/(?:def|class)\s+([A-Za-z0-9_$]+)/);
    if (match) return match[1];
  }

  // Fallback: search for first prominent non-reserved identifier in selection
  const words = selectedCode.match(/[A-Za-z_$][A-Za-z0-9_$]{3,}/g) || [];
  const reserved = new Set([
    'function', 'const', 'return', 'import', 'export', 'public', 'private', 'protected',
    'async', 'await', 'class', 'extends', 'router', 'express', 'app', 'post', 'get', 'put', 'delete', 'patch'
  ]);
  for (const word of words) {
    if (!reserved.has(word)) return word;
  }

  return null;
}

/**
 * Check if file content explicitly imports or requires the target module/file
 */
function checkFileImportsTarget(fileContent, targetBaseName, normalizedTarget) {
  if (!fileContent || !targetBaseName) return false;

  const targetNameNoExt = targetBaseName.replace(/\.[^/.]+$/, '');
  const cleanTargetNoExt = targetNameNoExt.replace(/Controller|Service|Repository|Component|Model$/i, '');

  // Regex patterns for ES Module, CommonJS, and PHP imports
  const importRegex = new RegExp(
    `(?:import\\s+.*?from\\s+['"][^'"]*${targetNameNoExt}[^'"]*['"]|require\\(['"][^'"]*${targetNameNoExt}[^'"]*['"]\\)|use\\s+.*?\\b${targetNameNoExt}\\b|\\\\?App\\\\.*?\\b${targetNameNoExt}\\b)`,
    'i'
  );

  if (importRegex.test(fileContent)) return true;

  // Secondary check for relative paths (e.g. ./studentController or ../studentController)
  if (cleanTargetNoExt.length >= 3) {
    const secondaryRegex = new RegExp(
      `(?:import\\s+.*?from\\s+['"][^'"]*${cleanTargetNoExt}[^'"]*['"]|require\\(['"][^'"]*${cleanTargetNoExt}[^'"]*['"]\\))`,
      'i'
    );
    if (secondaryRegex.test(fileContent)) return true;
  }

  return false;
}

/**
 * Check if file content locally declares / shadows the symbol (e.g. React useState setter)
 */
function checkLocalShadow(fileContent, symbol) {
  if (!fileContent || !symbol) return false;

  // React useState pattern: const [x, symbol] = useState(...)
  const useStateRegex = new RegExp(`const\\s*\\[[^\\]]*?\\b${symbol}\\b[^\\]]*?\\]\\s*=\\s*useState`, 'i');
  if (useStateRegex.test(fileContent)) return true;

  // Local variable/function declaration: const symbol =, let symbol =, function symbol()
  const localDeclRegex = new RegExp(`(?:const|let|var|function)\\s+\\b${symbol}\\b\\s*(=|\\()`);
  if (localDeclRegex.test(fileContent)) return true;

  return false;
}

/**
 * Search repository and separate VERIFIED DIRECT CALLERS from POSSIBLE REFERENCES
 */
async function findCallersAndReferences(repoDir, targetFile, symbol) {
  const directCallers = [];
  const possibleReferences = [];

  if (!symbol) {
    return { directCallers, possibleReferences };
  }

  const normalizedTarget = targetFile.replace(/\\/g, '/');
  const targetBaseName = path.basename(normalizedTarget);
  const isCommon = COMMON_IDENTIFIERS.has(symbol);

  try {
    const stdout = await repositoryService.runGitCommand(
      ['grep', '-n', '-w', symbol],
      repoDir
    );

    if (!stdout) return { directCallers, possibleReferences };

    const rawLines = stdout.split('\n');
    const matchesByFile = new Map();

    for (const rawLine of rawLines) {
      const parts = rawLine.split(':');
      if (parts.length < 3) continue;

      const file = parts[0].replace(/\\/g, '/');
      const lineNum = parseInt(parts[1], 10);
      const codeLine = parts.slice(2).join(':').trim();

      if (!matchesByFile.has(file)) {
        matchesByFile.set(file, []);
      }
      matchesByFile.get(file).push({ line: lineNum, snippet: codeLine });
    }

    for (const [file, items] of matchesByFile.entries()) {
      const isTargetFile = file === normalizedTarget;
      const isRouteFile = file.includes('routes/') || file.includes('routes\\') || file.endsWith('Routes.js') || file.endsWith('routes.js');

      let fileContent = '';
      try {
        const targetPath = path.resolve(repoDir, file);
        fileContent = await fs.readFile(targetPath, 'utf8');
      } catch (_) {}

      const importsTargetFile = checkFileImportsTarget(fileContent, targetBaseName, normalizedTarget);
      const hasLocalShadow = checkLocalShadow(fileContent, symbol);

      for (const item of items) {
        const { line, snippet } = item;

        // Skip import statement lines
        if (snippet.startsWith('import ') || snippet.startsWith('use ') || snippet.includes('require(')) {
          if (snippet.includes('import ') && snippet.includes(symbol)) continue;
        }

        // Skip export declaration line in target file
        if (isTargetFile && (snippet.includes(`function ${symbol}`) || snippet.includes(`const ${symbol}`) || snippet.includes(`class ${symbol}`))) {
          continue;
        }

        // Skip route registration lines (e.g. router.get('/me', getMyProfileStudent)) from caller & reference lists.
        // Route-to-handler relationships are verified and displayed under ROUTES / ENDPOINTS.
        const isRouteRegistrationSnippet = Boolean(snippet.match(/(?:router|app)\.(?:get|post|put|delete|patch|use)\s*\(/i) || snippet.match(/Route::/i));
        if (isRouteRegistrationSnippet) {
          continue;
        }

        if (isTargetFile) {
          if (!hasLocalShadow) {
            directCallers.push({
              file,
              line,
              referenceType: 'function_call',
              snippet: snippet.slice(0, 150),
              evidence: `Internal function call within ${targetBaseName}`
            });
          }
        } else if (importsTargetFile && !hasLocalShadow && !isRouteFile) {
          directCallers.push({
            file,
            line,
            referenceType: 'function_call',
            snippet: snippet.slice(0, 150),
            evidence: `Imported ${symbol} from ${targetBaseName}`
          });
        } else if (!isRouteFile) {
          possibleReferences.push({
            file,
            line,
            snippet: snippet.slice(0, 150),
            reason: isCommon 
              ? `Common identifier '${symbol}' matching text; symbol identity could not be established.`
              : 'Identifier name matches, but symbol identity could not be established.'
          });
        }
      }
    }
  } catch (_) {}

  return {
    directCallers: directCallers.slice(0, 10),
    possibleReferences: possibleReferences.slice(0, 10)
  };
}

/**
 * Identify direct imports and model dependencies in selected code / file
 */
function findDirectDependencies(selectedCode, fileContent, symbol) {
  if (!selectedCode && !fileContent) return [];

  const dependencies = [];
  const fullText = fileContent || selectedCode || '';
  const lines = fullText.split('\n');

  // 1. Extract all imported or required modules/models in the file
  const importedMap = new Map();

  for (const line of lines) {
    // ES Module imports: import Student from '../models/Student' or import { Student } from '...'
    let match = line.match(/import\s+([A-Za-z0-9_{},\s*]+)\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      const rawNames = match[1].replace(/[{}]/g, '').split(',');
      const source = match[2];
      const isModel = source.includes('model') || source.includes('Model') || /^[A-Z]/.test(rawNames[0].trim());
      for (let n of rawNames) {
        n = n.trim();
        if (n) {
          importedMap.set(n, { name: n, source, type: isModel ? 'model' : 'import' });
        }
      }
      continue;
    }

    // CommonJS require: const Student = require('../models/Student') or const { Student } = require('...')
    match = line.match(/(?:const|let|var)\s+([A-Za-z0-9_{},\s]+)\s*=\s*require\(['"]([^'"]+)['"]\)/);
    if (match) {
      const rawNames = match[1].replace(/[{}]/g, '').split(',');
      const source = match[2];
      const isModel = source.includes('model') || source.includes('Model') || /^[A-Z]/.test(rawNames[0].trim());
      for (let n of rawNames) {
        n = n.trim();
        if (n) {
          importedMap.set(n, { name: n, source, type: isModel ? 'model' : 'import' });
        }
      }
      continue;
    }

    // PHP use statement: use App\Models\Invoice;
    match = line.match(/use\s+([A-Za-z0-9_\\\s,{}]+);/);
    if (match) {
      const parts = match[1].trim().split('\\');
      const name = parts[parts.length - 1];
      importedMap.set(name, { name, source: match[1].trim(), type: 'model' });
    }
  }

  // 2. Scan selectedCode for actual usage of imported models/modules
  const selected = selectedCode || fullText;
  const selLines = selected.split('\n');

  for (const line of selLines) {
    // Check Mongoose / ORM method calls: Student.findOne(...), Student.findById(...), Student.find(...), Student.create(...)
    const modelCallMatch = line.match(/([A-Z][A-Za-z0-9_]*)\.(findOne|findById|find|create|updateOne|update|deleteOne|delete|countDocuments|aggregate|exec|all|where|query|store|save)\s*\(/);
    if (modelCallMatch) {
      const modelName = modelCallMatch[1];
      const methodName = modelCallMatch[2];
      const imp = importedMap.get(modelName);
      if (imp) {
        const funcStr = symbol ? `${symbol}()` : 'selected code';
        dependencies.push({
          name: imp.name,
          source: imp.source,
          type: 'model',
          evidence: `${modelName}.${methodName}() in ${funcStr}`
        });
      } else {
        // Model call referenced directly without explicit import line found
        const funcStr = symbol ? `${symbol}()` : 'selected code';
        dependencies.push({
          name: modelName,
          source: modelName,
          type: 'model',
          evidence: `${modelName}.${methodName}() in ${funcStr}`
        });
      }
    }

    // Check PHP style static calls: Student::findOne(...)
    const phpCallMatch = line.match(/([A-Z][A-Za-z0-9_]*)::(?:create|where|find|all|query|store|whereFirst)/);
    if (phpCallMatch) {
      const modelName = phpCallMatch[1];
      const funcStr = symbol ? `${symbol}()` : 'selected code';
      dependencies.push({
        name: modelName,
        source: modelName,
        type: 'model',
        evidence: `${modelName} call in ${funcStr}`
      });
    }

    // Check instantiation: new Student(...)
    const newInstMatch = line.match(/new\s+([A-Z][A-Za-z0-9_]*)\s*\(/);
    if (newInstMatch) {
      const modelName = newInstMatch[1];
      const imp = importedMap.get(modelName);
      if (imp) {
        const funcStr = symbol ? `${symbol}()` : 'selected code';
        dependencies.push({
          name: imp.name,
          source: imp.source,
          type: 'model',
          evidence: `new ${modelName}() in ${funcStr}`
        });
      }
    }
  }

  // If no method usage matched but imports are in selectedCode itself
  if (dependencies.length === 0 && selectedCode) {
    for (const [name, imp] of importedMap.entries()) {
      if (selectedCode.includes(name) && !COMMON_IDENTIFIERS.has(name)) {
        dependencies.push({
          name: imp.name,
          source: imp.source,
          type: imp.type,
          evidence: `Imported in file and used in selected code`
        });
      }
    }
  }

  // Deduplicate dependencies by name
  const seen = new Set();
  return dependencies.filter(d => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

/**
 * Scan repository for route definitions associated with symbol or target file
 */
async function findRoutes(repoDir, targetFile, symbol) {
  const routes = [];
  const normalizedTarget = targetFile.replace(/\\/g, '/');
  const targetBaseName = path.basename(targetFile, path.extname(targetFile));

  const searchTerms = [symbol, targetBaseName].filter(Boolean);

  for (const term of searchTerms) {
    try {
      const stdout = await repositoryService.runGitCommand(
        ['grep', '-n', '-i', term],
        repoDir
      );

      if (!stdout) continue;

      const lines = stdout.split('\n');
      for (const rawLine of lines) {
        const parts = rawLine.split(':');
        if (parts.length < 3) continue;

        const file = parts[0].replace(/\\/g, '/');
        const codeLine = parts.slice(2).join(':').trim();

        if (file.includes('route') || file.includes('api') || file.includes('web') || file.includes('server') || file.includes('app')) {
          let routeMatch = codeLine.match(/(router|app)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/i);
          if (routeMatch) {
            routes.push({
              path: routeMatch[3],
              method: routeMatch[2].toUpperCase(),
              handler: term,
              definedIn: file
            });
            continue;
          }

          routeMatch = codeLine.match(/Route::(get|post|put|delete|patch|resource)\(['"]([^'"]+)['"]/i);
          if (routeMatch) {
            routes.push({
              path: routeMatch[2],
              method: routeMatch[1].toUpperCase(),
              handler: term,
              definedIn: file
            });
          }
        }
      }
    } catch (_) {}
  }

  const seen = new Set();
  return routes.filter(r => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Discover frontend / client files that call a given route path
 */
async function findRouteConsumers(repoDir, routePath) {
  const consumers = [];
  if (!routePath || typeof routePath !== 'string') return consumers;

  const cleanPath = routePath.replace(/^\//, '');
  if (!cleanPath || cleanPath.length < 3) return consumers;

  try {
    const stdout = await repositoryService.runGitCommand(
      ['grep', '-n', '-i', cleanPath],
      repoDir
    );

    if (!stdout) return consumers;

    const lines = stdout.split('\n');
    for (const rawLine of lines) {
      const parts = rawLine.split(':');
      if (parts.length < 3) continue;

      const file = parts[0].replace(/\\/g, '/');
      const lineNum = parseInt(parts[1], 10);
      const codeLine = parts.slice(2).join(':').trim();

      // Skip route definition files themselves
      if (file.includes('routes/') || file.includes('routes\\') || file.endsWith('Routes.js') || file.endsWith('routes.js')) {
        continue;
      }

      consumers.push({
        file,
        line: lineNum,
        snippet: codeLine.slice(0, 150),
        routePath
      });
    }
  } catch (_) {}

  return consumers;
}

/**
 * Format human-readable evidence-grounded functionality name
 * Rules:
 * 1. Models/Entities (Student, Invoice, PracticeLog) are NOT functionalities.
 * 2. Represent an action the user or system actually does (Retrieval, Submission, Creation, View).
 * 3. Do not invent broad feature names if evidence only establishes endpoint; use explicit endpoint description.
 */
function deriveFunctionalityName(file, symbol, routePath, snippet) {
  const sLower = (symbol || '').toLowerCase();
  const rLower = (routePath || '').toLowerCase();
  const fLower = (file || '').toLowerCase();

  // Known specific evidence mappings
  if (sLower.includes('myprofile') || sLower.includes('getprofile') || rLower.includes('/me') || rLower.includes('student/profile') || fLower.includes('profile')) {
    return 'Student Profile Retrieval';
  }

  if (sLower.includes('practicelog') || sLower.includes('submitpractice') || rLower.includes('practice-log')) {
    return 'Practice Log Submission';
  }

  if (sLower.includes('practicehistory') || rLower.includes('practice-history')) {
    return 'Practice History';
  }

  if (sLower.includes('createinvoice') || (rLower.includes('invoice') && rLower.includes('create'))) {
    return 'Create Invoice';
  }

  if (sLower.includes('changepassword') || rLower.includes('change-password')) {
    return 'Change Password';
  }

  if (sLower.includes('assignedteacher') || rLower.includes('teacher')) {
    return 'View Assigned Teacher';
  }

  // Parse symbol for Action + Entity (e.g., getMyProfileStudent, createStudent, deleteInvoice)
  if (symbol && symbol !== 'code_block') {
    const verbMatch = symbol.match(/^(get|fetch|read|find|retrieve|submit|post|save|create|add|update|edit|modify|delete|remove|destroy|view)/i);
    if (verbMatch) {
      const verb = verbMatch[1].toLowerCase();
      let entityPart = symbol.slice(verbMatch[0].length)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[-_]/g, ' ')
        .trim();

      if (entityPart) {
        const formattedEntity = entityPart.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        if (['get', 'fetch', 'read', 'find', 'retrieve'].includes(verb)) {
          return `${formattedEntity} Retrieval`;
        }
        if (['submit', 'post', 'save'].includes(verb)) {
          return `${formattedEntity} Submission`;
        }
        if (['create', 'add'].includes(verb)) {
          return `${formattedEntity} Creation`;
        }
        if (['update', 'edit', 'modify'].includes(verb)) {
          return `${formattedEntity} Update`;
        }
        if (['delete', 'remove', 'destroy'].includes(verb)) {
          return `${formattedEntity} Deletion`;
        }
        if (['view'].includes(verb)) {
          return `View ${formattedEntity}`;
        }
      }
    }
  }

  // File/Component title evidence
  if (file) {
    const base = path.basename(file, path.extname(file));
    let cleanBase = base
      .replace(/(?:Page|Component|View|Controller|Service|Routes)$/i, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .trim();

    if (cleanBase && !['Student', 'Invoice', 'PracticeLog', 'User', 'Item', 'Data'].includes(cleanBase)) {
      return `${cleanBase.charAt(0).toUpperCase() + cleanBase.slice(1)} Feature`;
    }
  }

  // Explicit endpoint description if no user-facing feature name is proven
  if (routePath) {
    return `${routePath} endpoint`;
  }

  return 'Application Feature';
}

/**
 * Build Affected Functionalities list & Functionality Graph from evidence
 */
async function discoverAffectedFunctionalities(repoDir, targetFile, symbol, routes, directCallers, possibleReferences, directDependencies) {
  const funcMap = new Map();
  const isCommon = COMMON_IDENTIFIERS.has(symbol);

  // If common identifier and no verified direct callers/routes exist, do NOT invent functionality mappings
  if (isCommon && directCallers.length === 0 && routes.length === 0) {
    return {
      affectedFunctionalities: [],
      functionalityGraph: {
        symbol: symbol || 'code_block',
        callers: [],
        routes: [],
        components: [],
        functionalities: []
      },
      noFunctionalityMessage: "No affected application functionality could be established from the available repository evidence."
    };
  }

  // 1. Process routes and their frontend consumers
  for (const r of routes) {
    const routeConsumers = await findRouteConsumers(repoDir, r.path);
    const routeHandlerName = r.handler || symbol || 'route_handler';

    if (routeConsumers.length > 0) {
      for (const consumer of routeConsumers) {
        const funcName = deriveFunctionalityName(consumer.file, routeHandlerName, r.path, consumer.snippet);
        const key = funcName.toLowerCase();

        if (!funcMap.has(key)) {
          funcMap.set(key, {
            name: funcName,
            relationship: 'DIRECT',
            confidence: 'HIGH',
            why: `${path.basename(consumer.file)} calls the endpoint (${r.method} ${r.path}) handled by ${routeHandlerName}().`,
            evidence: [
              {
                type: 'route',
                method: r.method,
                path: r.path,
                file: r.definedIn
              },
              {
                type: 'handler',
                symbol: routeHandlerName
              },
              {
                type: 'component',
                file: consumer.file,
                line: consumer.line
              }
            ]
          });
        }
      }
    } else {
      // Route exists but no frontend caller file was found directly
      const funcName = deriveFunctionalityName(targetFile, routeHandlerName, r.path, null);
      const key = funcName.toLowerCase();
      if (!funcMap.has(key)) {
        funcMap.set(key, {
          name: funcName,
          relationship: 'DIRECT',
          confidence: 'HIGH',
          why: `The ${r.method} ${r.path} route is directly registered with ${routeHandlerName}.`,
          evidence: [
            {
              type: 'route',
              method: r.method,
              path: r.path,
              file: r.definedIn
            },
            {
              type: 'handler',
              symbol: routeHandlerName
            }
          ]
        });
      }
    }
  }

  // 2. Process Direct Callers (exclude route files which are ROUTE HANDLER relationships)
  for (const caller of directCallers) {
    const isRouteFile = caller.file.includes('routes/') || caller.file.includes('routes\\') || caller.file.endsWith('Routes.js') || caller.file.endsWith('routes.js');
    if (isRouteFile) continue;

    const isUIComponent = caller.file.endsWith('.jsx') || caller.file.endsWith('.tsx') || caller.file.includes('Component') || caller.file.includes('Page') || caller.file.includes('views');
    const funcName = deriveFunctionalityName(caller.file, symbol, null, caller.snippet);
    const key = funcName.toLowerCase();

    const relationship = isUIComponent ? 'DIRECT' : 'INDIRECT';
    const confidence = isUIComponent ? 'HIGH' : 'MEDIUM';
    const why = isUIComponent
      ? `${path.basename(caller.file)} directly calls the selected code.`
      : `Uses ${path.basename(caller.file)} which directly invokes ${symbol || 'the selected code'}.`;

    if (!funcMap.has(key)) {
      funcMap.set(key, {
        name: funcName,
        relationship,
        confidence,
        why,
        evidence: [
          {
            type: isUIComponent ? 'component' : 'service',
            file: caller.file,
            line: caller.line,
            snippet: caller.snippet
          }
        ]
      });
    }
  }

  // 3. DO NOT convert models/entities in directDependencies directly into functionalities.
  // Models are displayed under DIRECT DEPENDENCIES, not AFFECTED FUNCTIONALITIES.

  const affectedFunctionalities = Array.from(funcMap.values());

  // Construct internal Functionality Graph
  const functionalityGraph = {
    symbol: symbol || 'code_block',
    callers: directCallers.map(c => c.file),
    routes: routes.map(r => `${r.method} ${r.path}`),
    components: directCallers.filter(c => c.file.endsWith('.jsx') || c.file.endsWith('.tsx') || c.file.includes('Component') || c.file.includes('Page')).map(c => c.file),
    functionalities: affectedFunctionalities.map(f => f.name)
  };

  const noFunctionalityMessage = affectedFunctionalities.length === 0
    ? "No affected application functionality could be established from the available repository evidence."
    : null;

  return {
    affectedFunctionalities,
    functionalityGraph,
    noFunctionalityMessage
  };
}

/**
 * Determine evidence-based removal analysis
 */
function buildRemovalAnalysis(symbol, routes, directCallers, affectedFunctionalities) {
  const symbolStr = symbol ? `${symbol}()` : 'this code';

  if (routes.length > 0) {
    const route = routes[0];
    const funcName = affectedFunctionalities.length > 0 
      ? affectedFunctionalities[0].name.toLowerCase()
      : `${route.method} ${route.path} endpoint`;

    return `Removing ${symbolStr} would leave the ${route.method} ${route.path} route without its current handler, so the ${funcName} may stop functioning.`;
  }

  if (directCallers.length > 0) {
    const callerFiles = Array.from(new Set(directCallers.map(c => path.basename(c.file)))).join(', ');
    const funcName = affectedFunctionalities.length > 0 
      ? affectedFunctionalities[0].name.toLowerCase()
      : 'dependent components';
    return `Removing ${symbolStr} would break verified calls in ${callerFiles}, so the ${funcName} may stop functioning.`;
  }

  return `Removing ${symbolStr} is not evidenced to leave any registered route or verified caller without a handler.`;
}

/**
 * Determine evidence-based modification analysis
 */
function buildModificationAnalysis(symbol, routes, directCallers, affectedFunctionalities) {
  const symbolStr = symbol ? `${symbol}()` : 'this code';

  if (routes.length > 0) {
    const route = routes[0];
    return `Changes to the response structure or retrieval behavior may affect clients that consume ${route.method} ${route.path}.`;
  }

  if (directCallers.length > 0) {
    const callerFiles = Array.from(new Set(directCallers.map(c => path.basename(c.file)))).join(', ');
    return `Changes to parameters or response contracts of ${symbolStr} may affect calling logic in ${callerFiles}.`;
  }

  return `Modifying ${symbolStr} alters local file implementation. No verified external caller contracts depend on this code.`;
}

/**
 * Determine related files based on naming conventions and directory structure
 */
async function findRelatedFiles(repoDir, targetFile) {
  const normalizedTarget = targetFile.replace(/\\/g, '/');
  const baseName = path.basename(normalizedTarget, path.extname(normalizedTarget));
  const entityName = baseName.replace(/(Controller|Service|Repository|View|Component|Model)$/i, '');

  const related = [];
  if (!entityName || entityName.length < 3) return related;

  try {
    const filesTree = await repositoryService.getFileTree(path.basename(repoDir));
    
    function walkNodes(nodes) {
      for (const node of nodes) {
        if (node.type === 'file') {
          const normNodePath = node.path.replace(/\\/g, '/');
          if (normNodePath !== normalizedTarget) {
            const nodeBase = path.basename(normNodePath);
            if (nodeBase.includes(entityName)) {
              related.push({
                file: normNodePath,
                relationship: 'name_similarity'
              });
            }
          }
        } else if (node.children) {
          walkNodes(node.children);
        }
      }
    }

    if (filesTree && filesTree.tree) {
      walkNodes(filesTree.tree);
    }
  } catch (_) {}

  return related.slice(0, 5);
}

const impactCache = new Map();

/**
 * Build comprehensive code impact evidence package
 */
async function buildImpactEvidence(repositoryId, targetFile, startLine, endLine) {
  const cacheKey = `${repositoryId}:${targetFile}:${startLine}:${endLine}`;
  if (impactCache.has(cacheKey)) {
    return impactCache.get(cacheKey);
  }

  const repoDir = repositoryService.getRepoDirectory(repositoryId);
  const sLine = parseInt(startLine, 10) || 1;
  const eLine = parseInt(endLine, 10) || sLine;

  // 1. Load target file content and slice selected code
  const fileContentObj = await repositoryService.getFileContent(repositoryId, targetFile);
  const fileLines = (fileContentObj.content || '').split('\n');
  const selectedLines = fileLines.slice(sLine - 1, eLine);
  const selectedCode = selectedLines.join('\n');

  // 2. Identify target symbol
  const symbol = extractSymbol(selectedCode);

  // 3. Find callers & possible references
  const { directCallers, possibleReferences } = await findCallersAndReferences(repoDir, targetFile, symbol);

  // 4. Find direct dependencies
  const directDependencies = findDirectDependencies(selectedCode, fileContentObj.content, symbol);

  // 5. Find connected routes / endpoints
  const routes = await findRoutes(repoDir, targetFile, symbol);

  // 6. Find related files (exclude files already verified under routes)
  const rawRelatedFiles = await findRelatedFiles(repoDir, targetFile);
  const routeFiles = new Set(routes.map(r => r.definedIn).filter(Boolean));
  const relatedFiles = rawRelatedFiles.filter(rf => !routeFiles.has(rf.file));

  // 7. Get git commit & historically co-changed files
  let introducingCommit = null;
  let historicallyCoChanged = [];

  try {
    const blameObj = await gitHistoryService.getGitBlame(repositoryId, targetFile, sLine, eLine);
    if (blameObj && blameObj.commitHash && blameObj.commitHash !== '0000000000000000000000000000000000000000') {
      const commitObj = await gitHistoryService.getCommitDetails(repositoryId, blameObj.commitHash);
      if (commitObj && commitObj.commit) {
        introducingCommit = {
          hash: commitObj.commit.hash,
          shortHash: commitObj.commit.shortHash,
          message: commitObj.commit.message,
          author: commitObj.commit.author,
          date: commitObj.commit.date
        };

        const allChangedFiles = commitObj.commit.filesChanged || [];
        historicallyCoChanged = allChangedFiles
          .filter(f => f.replace(/\\/g, '/') !== targetFile.replace(/\\/g, '/'))
          .map(f => ({ file: f.replace(/\\/g, '/'), relationship: 'co_changed_in_commit' }));
      }
    }
  } catch (_) {}

  // 8. Determine change type (Strict Rule: UNKNOWN if commit info is unavailable)
  let changeType = 'UNKNOWN';
  let commitHashStr = 'Unavailable';
  let commitMessageStr = 'No commit information';

  if (introducingCommit && introducingCommit.hash) {
    commitHashStr = introducingCommit.hash;
    commitMessageStr = introducingCommit.message || 'No commit message';
    const msg = (introducingCommit.message || '').toLowerCase();

    if (msg.startsWith('feat') || msg.includes('add') || msg.includes('create') || msg.includes('initial')) {
      changeType = 'added';
    } else if (msg.startsWith('fix') || msg.includes('update') || msg.includes('refactor') || msg.includes('change')) {
      changeType = 'modified';
    } else if (msg.includes('delete') || msg.includes('remove')) {
      changeType = 'removed';
    } else {
      changeType = 'modified';
    }
  }

  // 9. Discover Affected Functionalities & Graph
  const { affectedFunctionalities, functionalityGraph, noFunctionalityMessage } = await discoverAffectedFunctionalities(
    repoDir, targetFile, symbol, routes, directCallers, possibleReferences, directDependencies
  );

  // 10. Removal & Modification Analysis
  const removalImpact = buildRemovalAnalysis(symbol, routes, directCallers, affectedFunctionalities);
  const modificationImpact = buildModificationAnalysis(symbol, routes, directCallers, affectedFunctionalities);

  // 11. Calculate impact level and impact confidence strictly based on VERIFIED evidence
  let impactLevel = 'UNKNOWN';
  let impactConfidence = 'LOW';

  const hasVerifiedCallers = directCallers.length > 0;
  const hasVerifiedRoutes = routes.length > 0;
  const hasVerifiedDependencies = directDependencies.length > 0;
  const hasVerifiedFunctionalities = affectedFunctionalities.some(f => f.relationship === 'direct' || f.relationship === 'indirect');

  if (hasVerifiedCallers && (hasVerifiedRoutes || directCallers.length >= 2)) {
    impactLevel = 'HIGH';
    impactConfidence = 'HIGH';
  } else if (hasVerifiedCallers || hasVerifiedRoutes || hasVerifiedDependencies || hasVerifiedFunctionalities) {
    impactLevel = 'MEDIUM';
    impactConfidence = 'HIGH';
  } else if (relatedFiles.length > 0 || historicallyCoChanged.length > 0 || possibleReferences.length > 0) {
    impactLevel = 'LOW';
    impactConfidence = 'LOW';
  } else {
    impactLevel = 'UNKNOWN';
    impactConfidence = 'LOW';
  }

  // 12. Synthesize potential impact statements (hedged)
  const potentialImpacts = [];
  if (hasVerifiedCallers) {
    potentialImpacts.push(`Modifying this ${symbol || 'code'} may affect ${directCallers.length} verified direct caller file(s) referencing this symbol.`);
  }
  if (hasVerifiedRoutes) {
    potentialImpacts.push(`Changes here may impact ${routes.length} registered API/web route(s) (${routes.map(r => r.path).join(', ')}).`);
  }
  if (hasVerifiedDependencies) {
    potentialImpacts.push(`This code directly depends on ${directDependencies.map(d => d.name).join(', ')}, which could be affected if signatures or contracts change.`);
  }
  if (!hasVerifiedCallers && !hasVerifiedRoutes && !hasVerifiedDependencies) {
    potentialImpacts.push('No verified direct dependency or caller was identified from the available repository evidence.');
    if (possibleReferences.length > 0) {
      potentialImpacts.push(`${possibleReferences.length} unverified text reference(s) exist in the repository but symbol identity could not be established.`);
    }
  }

  const result = {
    success: true,
    selectedCode: {
      file: targetFile,
      startLine: sLine,
      endLine: eLine,
      symbol: symbol || 'code_block',
      code: selectedCode
    },
    change: {
      type: changeType,
      commit: commitHashStr,
      message: commitMessageStr
    },
    directCallers,
    possibleReferences,
    directDependencies,
    routes,
    relatedFiles,
    historicallyCoChanged,
    affectedFunctionalities,
    functionalityGraph,
    removalImpact,
    modificationImpact,
    noFunctionalityMessage,
    potentialImpacts,
    impactLevel,
    impactConfidence
  };

  impactCache.set(cacheKey, result);
  return result;
}

module.exports = {
  extractSymbol,
  findCallersAndReferences,
  findDirectDependencies,
  findRoutes,
  findRelatedFiles,
  findRouteConsumers,
  deriveFunctionalityName,
  discoverAffectedFunctionalities,
  buildRemovalAnalysis,
  buildModificationAnalysis,
  buildImpactEvidence
};

