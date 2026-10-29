/**
 * Lossless JSON bridge for the reviewed CPython 3.12 / Unicode 15 producer.
 *
 * Integers are safe native integers or bigint; ALL parsed floats are PythonFloat
 * instances. Never pass these values through JSON.stringify or structuredClone.
 * Generated integral Numbers mean Python ints; mark floats with pythonFloat().
 * Unsupported values fail closed rather than inventing canonical source bytes.
 */
import {numberKey as decimalNumberKey} from './tokenizer.mjs';

const ORDER = Symbol('Python dictionary insertion order');
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const MAX_INTEGER_DIGITS = 4300; // Reviewed CPython default int string limit.
const MAX_DEPTH = 512; // Explicit bound, below the reviewed recursion limit.
const encoder = new TextEncoder();

export class PythonFloat {
  constructor(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RangeError('PYTHON_JSON_NON_FINITE_FLOAT');
    }
    this.value = value;
    Object.freeze(this);
  }
  toString() { return floatString(this.value); }
  toJSON() { throw new TypeError('PYTHON_JSON_USE_CANONICAL_FOR_FLOATS'); }
  [Symbol.toPrimitive](hint) {
    if (hint === 'string') return this.toString();
    throw new TypeError('PYTHON_JSON_EXPLICIT_FLOAT_VALUE_REQUIRED');
  }
}
export const pythonFloat = value => new PythonFloat(value);
export const isNumeric = value => value instanceof PythonFloat || typeof value === 'bigint' || typeof value === 'number';
export const isRecord = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(value) === Object.prototype);

/** Dictionary iteration and mutation preserve Python order, including "10","2". */
export function record(items = []) {
  const target = Object.create(null), order = [];
  Object.defineProperty(target, ORDER, {value: order});
  const result = new Proxy(target, {
    defineProperty(object, key, descriptor) {
      if (key === ORDER && (!('value' in descriptor) || descriptor.value === order) && !descriptor.enumerable) {
        return Reflect.defineProperty(object, key, descriptor);
      }
      if (typeof key !== 'string') throw new TypeError('PYTHON_JSON_STRING_KEYS_REQUIRED');
      if ('get' in descriptor || 'set' in descriptor) throw new TypeError('PYTHON_JSON_ACCESSORS_UNSUPPORTED');
      const added = !own(object, key);
      const success = Reflect.defineProperty(object, key, descriptor);
      if (success && added) order.push(key);
      return success;
    },
    deleteProperty(object, key) {
      const existed = own(object, key), success = Reflect.deleteProperty(object, key);
      if (success && existed) {
        const index = order.indexOf(key);
        if (index !== -1) order.splice(index, 1);
      }
      return success;
    },
    ownKeys(object) { return [...order, ...Object.getOwnPropertySymbols(object)]; },
    setPrototypeOf(_object, prototype) { return prototype === null; },
  });
  for (const [key, value] of items) {
    if (typeof key !== 'string') throw new TypeError('PYTHON_JSON_STRING_KEYS_REQUIRED');
    result[key] = value;
  }
  return result;
}

export function entries(value) {
  if (!isRecord(value)) throw new TypeError('PYTHON_JSON_RECORD_REQUIRED');
  const keys = value[ORDER] ?? Object.keys(value);
  return keys.filter(key => Object.getOwnPropertyDescriptor(value, key)?.enumerable).map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!('value' in descriptor)) throw new TypeError('PYTHON_JSON_ACCESSORS_UNSUPPORTED');
    return [key, descriptor.value];
  });
}

/** Strict raw JSON parsing, with no native JSON.parse number rounding. */
export function parsePythonJSON(source) {
  if (typeof source !== 'string') throw new TypeError('PYTHON_JSON_RAW_STRING_REQUIRED');
  let position = 0;
  const error = () => { throw new SyntaxError(`PYTHON_JSON_INVALID_AT_${position}`); };
  const skip = () => { while (/[\x20\t\r\n]/.test(source[position] ?? '') && position < source.length) position++; };
  function string() {
    const start = position++;
    while (position < source.length) {
      const ch = source[position++];
      if (ch === '"') {
        try { return JSON.parse(source.slice(start, position)); } catch { return error(); }
      }
      if (ch === '\\') position++;
      else if (ch.charCodeAt(0) < 0x20) return error();
    }
    return error();
  }
  function value(depth) {
    if (depth > MAX_DEPTH) throw new RangeError('PYTHON_JSON_DEPTH_BOUND');
    skip();
    const ch = source[position];
    if (ch === '"') return string();
    if (ch === '{') {
      position++; skip();
      const result = record();
      if (source[position] === '}') { position++; return result; }
      for (;;) {
        if (source[position] !== '"') return error();
        const key = string(); skip();
        if (source[position++] !== ':') return error();
        result[key] = value(depth + 1); skip();
        if (source[position] === '}') { position++; return result; }
        if (source[position++] !== ',') return error();
        skip();
      }
    }
    if (ch === '[') {
      position++; skip();
      const result = [];
      if (source[position] === ']') { position++; return result; }
      for (;;) {
        result.push(value(depth + 1)); skip();
        if (source[position] === ']') { position++; return result; }
        if (source[position++] !== ',') return error();
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]]) {
      if (source.startsWith(literal, position)) { position += literal.length; return result; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(position));
    if (!match) return error();
    const literal = match[0]; position += literal.length;
    if (/[.eE]/.test(literal)) return pythonFloat(Number(literal));
    if (literal.replace(/^-/, '').length > MAX_INTEGER_DIGITS) throw new RangeError('PYTHON_JSON_INTEGER_DIGIT_BOUND');
    const integer = BigInt(literal);
    return integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(integer) : integer;
  }
  const result = value(0); skip();
  if (position !== source.length) error();
  return result;
}

// Exact binary64 rational, used for shortest-roundtrip formatting and equality.
const bitsBuffer = new ArrayBuffer(8), bitsView = new DataView(bitsBuffer);
function floatRatio(value) {
  bitsView.setFloat64(0, Math.abs(value), false);
  const bits = bitsView.getBigUint64(0, false);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponent ? (1n << 52n) | fraction : fraction;
  const shift = (exponent || 1) - 1023 - 52;
  return shift < 0 ? [mantissa, 1n << BigInt(-shift)] : [mantissa << BigInt(shift), 1n];
}
const powers = [1n];
function power10(exponent) {
  while (powers.length <= exponent) powers.push(powers.at(-1) * 10n);
  return powers[exponent];
}
function comparePower(numerator, denominator, exponent) {
  return exponent >= 0 ? numerator - denominator * power10(exponent) : numerator * power10(-exponent) - denominator;
}

/**
 * CPython's repr chooses the shortest correctly-rounded decimal, closest to the
 * exact binary value (ties even). Search 1..17 significant digits with bigint
 * rational arithmetic; do not trust JS's differing display thresholds/digits.
 */
export function floatString(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('PYTHON_JSON_NON_FINITE_FLOAT');
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';
  const negative = value < 0, absolute = Math.abs(value);
  const [numerator, denominator] = floatRatio(absolute);
  let exponent = Math.floor(Math.log10(absolute));
  while (comparePower(numerator, denominator, exponent) < 0) exponent--;
  while (comparePower(numerator, denominator, exponent + 1) >= 0) exponent++;
  let digits, decimalExponent;
  for (let precision = 1; precision <= 17; precision++) {
    const scale = precision - 1 - exponent;
    const n = scale >= 0 ? numerator * power10(scale) : numerator;
    const d = scale >= 0 ? denominator : denominator * power10(-scale);
    const floor = n / d;
    const remainder = n % d;
    const roundUp = remainder * 2n > d || (remainder * 2n === d && floor % 2n);
    // At powers of two the roundtrip interval is asymmetric: the closest
    // decimal can fall outside its shorter half while the other neighbor fits.
    const candidates = roundUp ? [floor + 1n, floor] : [floor, floor + 1n];
    const coefficient = candidates.find(candidate => Number(`${candidate}e${-scale}`) === absolute);
    if (coefficient === undefined) continue;
    digits = coefficient.toString();
    decimalExponent = -scale;
    while (digits.endsWith('0')) { digits = digits.slice(0, -1); decimalExponent++; }
    break;
  }
  if (!digits) throw new RangeError('PYTHON_JSON_FLOAT_FORMAT_UNSUPPORTED');
  const magnitude = digits.length + decimalExponent - 1;
  let text;
  if (magnitude < -4 || magnitude >= 16) {
    text = digits[0] + (digits.length > 1 ? '.' + digits.slice(1) : '') +
      'e' + (magnitude < 0 ? '-' : '+') + String(Math.abs(magnitude)).padStart(2, '0');
  } else {
    const point = digits.length + decimalExponent;
    text = point <= 0 ? '0.' + '0'.repeat(-point) + digits :
      point >= digits.length ? digits + '0'.repeat(point - digits.length) + '.0' :
      digits.slice(0, point) + '.' + digits.slice(point);
  }
  return (negative ? '-' : '') + text;
}

function integerString(value) {
  const result = String(value);
  if (result.replace(/^-/, '').length > MAX_INTEGER_DIGITS) throw new RangeError('PYTHON_JSON_INTEGER_DIGIT_BOUND');
  return result;
}
function numberString(value) {
  if (value instanceof PythonFloat) return floatString(value.value);
  if (typeof value === 'bigint') return integerString(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('PYTHON_JSON_NON_FINITE_NUMBER');
  if (!Number.isInteger(value) || Object.is(value, -0)) return floatString(value);
  if (!Number.isSafeInteger(value)) throw new RangeError('PYTHON_JSON_AMBIGUOUS_UNSAFE_NUMBER');
  return integerString(value);
}
function checkedUnicode(value) {
  // Python canonical(...).encode('utf-8') rejects lone surrogates. TextEncoder
  // would silently replace them and JSON.stringify would silently escape them.
  if (!value.isWellFormed()) throw new RangeError('PYTHON_JSON_LONE_SURROGATE');
  return value;
}
export function compareCodepoints(left, right) {
  const a = left[Symbol.iterator](), b = right[Symbol.iterator]();
  for (;;) {
    const x = a.next(), y = b.next();
    if (x.done || y.done) return x.done ? y.done ? 0 : -1 : 1;
    const delta = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (delta) return delta < 0 ? -1 : 1;
  }
}

export function canonical(value) {
  const active = new Set();
  function serialize(item, depth) {
    if (depth > MAX_DEPTH) throw new RangeError('PYTHON_JSON_DEPTH_BOUND');
    if (item === null) return 'null';
    if (typeof item === 'string') return JSON.stringify(checkedUnicode(item));
    if (typeof item === 'boolean') return item ? 'true' : 'false';
    if (isNumeric(item)) return numberString(item);
    if (!Array.isArray(item) && !isRecord(item)) throw new TypeError('PYTHON_JSON_UNSUPPORTED_VALUE');
    if (active.has(item)) throw new TypeError('PYTHON_JSON_CIRCULAR_VALUE');
    active.add(item);
    let result;
    if (Array.isArray(item)) {
      result = '[' + Array.from({length: item.length}, (_, index) => serialize(item[index], depth + 1)).join(',') + ']';
    } else {
      result = '{' + entries(item).sort(([a], [b]) => compareCodepoints(a, b))
        .map(([key, child]) => JSON.stringify(checkedUnicode(key)) + ':' + serialize(child, depth + 1)).join(',') + '}';
    }
    active.delete(item);
    return result;
  }
  return serialize(value, 0);
}
export const canonicalBytes = value => encoder.encode(canonical(value));

// Generated with CPython 3.12.14 str.isprintable(), Unicode 15.0.0.
// Unicode data license: see THIRD_PARTY_NOTICES.txt.
const NONPRINTABLE_RANGES = [[0,31],[127,160],[173,173],[888,889],[896,899],[907,907],[909,909],[930,930],[1328,1328],[1367,1368],[1419,1420],[1424,1424],[1480,1487],[1515,1518],[1525,1541],[1564,1564],[1757,1757],[1806,1807],[1867,1868],[1970,1983],[2043,2044],[2094,2095],[2111,2111],[2140,2141],[2143,2143],[2155,2159],[2191,2199],[2274,2274],[2436,2436],[2445,2446],[2449,2450],[2473,2473],[2481,2481],[2483,2485],[2490,2491],[2501,2502],[2505,2506],[2511,2518],[2520,2523],[2526,2526],[2532,2533],[2559,2560],[2564,2564],[2571,2574],[2577,2578],[2601,2601],[2609,2609],[2612,2612],[2615,2615],[2618,2619],[2621,2621],[2627,2630],[2633,2634],[2638,2640],[2642,2648],[2653,2653],[2655,2661],[2679,2688],[2692,2692],[2702,2702],[2706,2706],[2729,2729],[2737,2737],[2740,2740],[2746,2747],[2758,2758],[2762,2762],[2766,2767],[2769,2783],[2788,2789],[2802,2808],[2816,2816],[2820,2820],[2829,2830],[2833,2834],[2857,2857],[2865,2865],[2868,2868],[2874,2875],[2885,2886],[2889,2890],[2894,2900],[2904,2907],[2910,2910],[2916,2917],[2936,2945],[2948,2948],[2955,2957],[2961,2961],[2966,2968],[2971,2971],[2973,2973],[2976,2978],[2981,2983],[2987,2989],[3002,3005],[3011,3013],[3017,3017],[3022,3023],[3025,3030],[3032,3045],[3067,3071],[3085,3085],[3089,3089],[3113,3113],[3130,3131],[3141,3141],[3145,3145],[3150,3156],[3159,3159],[3163,3164],[3166,3167],[3172,3173],[3184,3190],[3213,3213],[3217,3217],[3241,3241],[3252,3252],[3258,3259],[3269,3269],[3273,3273],[3278,3284],[3287,3292],[3295,3295],[3300,3301],[3312,3312],[3316,3327],[3341,3341],[3345,3345],[3397,3397],[3401,3401],[3408,3411],[3428,3429],[3456,3456],[3460,3460],[3479,3481],[3506,3506],[3516,3516],[3518,3519],[3527,3529],[3531,3534],[3541,3541],[3543,3543],[3552,3557],[3568,3569],[3573,3584],[3643,3646],[3676,3712],[3715,3715],[3717,3717],[3723,3723],[3748,3748],[3750,3750],[3774,3775],[3781,3781],[3783,3783],[3791,3791],[3802,3803],[3808,3839],[3912,3912],[3949,3952],[3992,3992],[4029,4029],[4045,4045],[4059,4095],[4294,4294],[4296,4300],[4302,4303],[4681,4681],[4686,4687],[4695,4695],[4697,4697],[4702,4703],[4745,4745],[4750,4751],[4785,4785],[4790,4791],[4799,4799],[4801,4801],[4806,4807],[4823,4823],[4881,4881],[4886,4887],[4955,4956],[4989,4991],[5018,5023],[5110,5111],[5118,5119],[5760,5760],[5789,5791],[5881,5887],[5910,5918],[5943,5951],[5972,5983],[5997,5997],[6001,6001],[6004,6015],[6110,6111],[6122,6127],[6138,6143],[6158,6158],[6170,6175],[6265,6271],[6315,6319],[6390,6399],[6431,6431],[6444,6447],[6460,6463],[6465,6467],[6510,6511],[6517,6527],[6572,6575],[6602,6607],[6619,6621],[6684,6685],[6751,6751],[6781,6782],[6794,6799],[6810,6815],[6830,6831],[6863,6911],[6989,6991],[7039,7039],[7156,7163],[7224,7226],[7242,7244],[7305,7311],[7355,7356],[7368,7375],[7419,7423],[7958,7959],[7966,7967],[8006,8007],[8014,8015],[8024,8024],[8026,8026],[8028,8028],[8030,8030],[8062,8063],[8117,8117],[8133,8133],[8148,8149],[8156,8156],[8176,8177],[8181,8181],[8191,8207],[8232,8239],[8287,8303],[8306,8307],[8335,8335],[8349,8351],[8385,8399],[8433,8447],[8588,8591],[9255,9279],[9291,9311],[11124,11125],[11158,11158],[11508,11512],[11558,11558],[11560,11564],[11566,11567],[11624,11630],[11633,11646],[11671,11679],[11687,11687],[11695,11695],[11703,11703],[11711,11711],[11719,11719],[11727,11727],[11735,11735],[11743,11743],[11870,11903],[11930,11930],[12020,12031],[12246,12271],[12284,12288],[12352,12352],[12439,12440],[12544,12548],[12592,12592],[12687,12687],[12772,12783],[12831,12831],[42125,42127],[42183,42191],[42540,42559],[42744,42751],[42955,42959],[42962,42962],[42964,42964],[42970,42993],[43053,43055],[43066,43071],[43128,43135],[43206,43213],[43226,43231],[43348,43358],[43389,43391],[43470,43470],[43482,43485],[43519,43519],[43575,43583],[43598,43599],[43610,43611],[43715,43738],[43767,43776],[43783,43784],[43791,43792],[43799,43807],[43815,43815],[43823,43823],[43884,43887],[44014,44015],[44026,44031],[55204,55215],[55239,55242],[55292,63743],[64110,64111],[64218,64255],[64263,64274],[64280,64284],[64311,64311],[64317,64317],[64319,64319],[64322,64322],[64325,64325],[64451,64466],[64912,64913],[64968,64974],[64976,65007],[65050,65055],[65107,65107],[65127,65127],[65132,65135],[65141,65141],[65277,65280],[65471,65473],[65480,65481],[65488,65489],[65496,65497],[65501,65503],[65511,65511],[65519,65531],[65534,65535],[65548,65548],[65575,65575],[65595,65595],[65598,65598],[65614,65615],[65630,65663],[65787,65791],[65795,65798],[65844,65846],[65935,65935],[65949,65951],[65953,65999],[66046,66175],[66205,66207],[66257,66271],[66300,66303],[66340,66348],[66379,66383],[66427,66431],[66462,66462],[66500,66503],[66518,66559],[66718,66719],[66730,66735],[66772,66775],[66812,66815],[66856,66863],[66916,66926],[66939,66939],[66955,66955],[66963,66963],[66966,66966],[66978,66978],[66994,66994],[67002,67002],[67005,67071],[67383,67391],[67414,67423],[67432,67455],[67462,67462],[67505,67505],[67515,67583],[67590,67591],[67593,67593],[67638,67638],[67641,67643],[67645,67646],[67670,67670],[67743,67750],[67760,67807],[67827,67827],[67830,67834],[67868,67870],[67898,67902],[67904,67967],[68024,68027],[68048,68049],[68100,68100],[68103,68107],[68116,68116],[68120,68120],[68150,68151],[68155,68158],[68169,68175],[68185,68191],[68256,68287],[68327,68330],[68343,68351],[68406,68408],[68438,68439],[68467,68471],[68498,68504],[68509,68520],[68528,68607],[68681,68735],[68787,68799],[68851,68857],[68904,68911],[68922,69215],[69247,69247],[69290,69290],[69294,69295],[69298,69372],[69416,69423],[69466,69487],[69514,69551],[69580,69599],[69623,69631],[69710,69713],[69750,69758],[69821,69821],[69827,69839],[69865,69871],[69882,69887],[69941,69941],[69960,69967],[70007,70015],[70112,70112],[70133,70143],[70162,70162],[70210,70271],[70279,70279],[70281,70281],[70286,70286],[70302,70302],[70314,70319],[70379,70383],[70394,70399],[70404,70404],[70413,70414],[70417,70418],[70441,70441],[70449,70449],[70452,70452],[70458,70458],[70469,70470],[70473,70474],[70478,70479],[70481,70486],[70488,70492],[70500,70501],[70509,70511],[70517,70655],[70748,70748],[70754,70783],[70856,70863],[70874,71039],[71094,71095],[71134,71167],[71237,71247],[71258,71263],[71277,71295],[71354,71359],[71370,71423],[71451,71452],[71468,71471],[71495,71679],[71740,71839],[71923,71934],[71943,71944],[71946,71947],[71956,71956],[71959,71959],[71990,71990],[71993,71994],[72007,72015],[72026,72095],[72104,72105],[72152,72153],[72165,72191],[72264,72271],[72355,72367],[72441,72447],[72458,72703],[72713,72713],[72759,72759],[72774,72783],[72813,72815],[72848,72849],[72872,72872],[72887,72959],[72967,72967],[72970,72970],[73015,73017],[73019,73019],[73022,73022],[73032,73039],[73050,73055],[73062,73062],[73065,73065],[73103,73103],[73106,73106],[73113,73119],[73130,73439],[73465,73471],[73489,73489],[73531,73533],[73562,73647],[73649,73663],[73714,73726],[74650,74751],[74863,74863],[74869,74879],[75076,77711],[77811,77823],[78896,78911],[78934,82943],[83527,92159],[92729,92735],[92767,92767],[92778,92781],[92863,92863],[92874,92879],[92910,92911],[92918,92927],[92998,93007],[93018,93018],[93026,93026],[93048,93052],[93072,93759],[93851,93951],[94027,94030],[94088,94094],[94112,94175],[94181,94191],[94194,94207],[100344,100351],[101590,101631],[101641,110575],[110580,110580],[110588,110588],[110591,110591],[110883,110897],[110899,110927],[110931,110932],[110934,110947],[110952,110959],[111356,113663],[113771,113775],[113789,113791],[113801,113807],[113818,113819],[113824,118527],[118574,118575],[118599,118607],[118724,118783],[119030,119039],[119079,119080],[119155,119162],[119275,119295],[119366,119487],[119508,119519],[119540,119551],[119639,119647],[119673,119807],[119893,119893],[119965,119965],[119968,119969],[119971,119972],[119975,119976],[119981,119981],[119994,119994],[119996,119996],[120004,120004],[120070,120070],[120075,120076],[120085,120085],[120093,120093],[120122,120122],[120127,120127],[120133,120133],[120135,120137],[120145,120145],[120486,120487],[120780,120781],[121484,121498],[121504,121504],[121520,122623],[122655,122660],[122667,122879],[122887,122887],[122905,122906],[122914,122914],[122917,122917],[122923,122927],[122990,123022],[123024,123135],[123181,123183],[123198,123199],[123210,123213],[123216,123535],[123567,123583],[123642,123646],[123648,124111],[124154,124895],[124903,124903],[124908,124908],[124911,124911],[124927,124927],[125125,125126],[125143,125183],[125260,125263],[125274,125277],[125280,126064],[126133,126208],[126270,126463],[126468,126468],[126496,126496],[126499,126499],[126501,126502],[126504,126504],[126515,126515],[126520,126520],[126522,126522],[126524,126529],[126531,126534],[126536,126536],[126538,126538],[126540,126540],[126544,126544],[126547,126547],[126549,126550],[126552,126552],[126554,126554],[126556,126556],[126558,126558],[126560,126560],[126563,126563],[126565,126566],[126571,126571],[126579,126579],[126584,126584],[126589,126589],[126591,126591],[126602,126602],[126620,126624],[126628,126628],[126634,126634],[126652,126703],[126706,126975],[127020,127023],[127124,127135],[127151,127152],[127168,127168],[127184,127184],[127222,127231],[127406,127461],[127491,127503],[127548,127551],[127561,127567],[127570,127583],[127590,127743],[128728,128731],[128749,128751],[128765,128767],[128887,128890],[128986,128991],[129004,129007],[129009,129023],[129036,129039],[129096,129103],[129114,129119],[129160,129167],[129198,129199],[129202,129279],[129620,129631],[129646,129647],[129661,129663],[129673,129679],[129726,129726],[129734,129741],[129756,129759],[129769,129775],[129785,129791],[129939,129939],[129995,130031],[130042,131071],[173792,173823],[177978,177983],[178206,178207],[183970,183983],[191457,194559],[195102,196607],[201547,201551],[205744,917759],[918000,1114111]];
function isPrintable(cp) {
  let low = 0, high = NONPRINTABLE_RANGES.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, [start, end] = NONPRINTABLE_RANGES[middle];
    if (cp < start) high = middle - 1;
    else if (cp > end) low = middle + 1;
    else return false;
  }
  return true;
}
function reprString(value) {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  let output = quote;
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (ch === quote || ch === '\\') output += '\\' + ch;
    else if (ch === '\t') output += '\\t';
    else if (ch === '\r') output += '\\r';
    else if (ch === '\n') output += '\\n';
    else if (!isPrintable(cp)) output += cp <= 0xff ? '\\x' + cp.toString(16).padStart(2, '0') :
      cp <= 0xffff ? '\\u' + cp.toString(16).padStart(4, '0') : '\\U' + cp.toString(16).padStart(8, '0');
    else output += ch;
  }
  return output + quote;
}
export function pyStr(value) {
  const active = new Set();
  function format(item, repr, depth) {
    if (depth > MAX_DEPTH) throw new RangeError('PYTHON_JSON_DEPTH_BOUND');
    if (item === null) return 'None';
    if (typeof item === 'string') return repr ? reprString(item) : item;
    if (typeof item === 'boolean') return item ? 'True' : 'False';
    if (isNumeric(item)) return numberString(item);
    if (!Array.isArray(item) && !isRecord(item)) throw new TypeError('PYTHON_JSON_UNSUPPORTED_VALUE');
    if (active.has(item)) throw new TypeError('PYTHON_JSON_CIRCULAR_VALUE');
    active.add(item);
    const result = Array.isArray(item) ? '[' + Array.from({length: item.length}, (_, index) => format(item[index], true, depth + 1)).join(', ') + ']' :
      '{' + entries(item).map(([key, child]) => reprString(key) + ': ' + format(child, true, depth + 1)).join(', ') + '}';
    active.delete(item);
    return result;
  }
  return format(value, false, 0);
}
export function pyTruthy(value) {
  if (value === null || value === false) return false;
  if (value instanceof PythonFloat) return value.value !== 0;
  if (typeof value === 'bigint') return value !== 0n;
  if (typeof value === 'number') { numberString(value); return value !== 0; }
  if (typeof value === 'string' || Array.isArray(value)) return value.length !== 0;
  if (isRecord(value)) return entries(value).length !== 0;
  if (value === true) return true;
  throw new TypeError('PYTHON_JSON_UNSUPPORTED_VALUE');
}
export const numberKey = value => decimalNumberKey(pyStr(value));

function numericEqual(left, right) {
  const l = left instanceof PythonFloat ? left.value : left;
  const r = right instanceof PythonFloat ? right.value : right;
  // Validate ambiguity/non-finites even when a caller supplied native Numbers.
  numberString(left); numberString(right);
  const integer = value => typeof value === 'bigint' || Number.isInteger(value);
  if (integer(l) && integer(r)) return BigInt(l) === BigInt(r);
  if (typeof l === 'bigint' || typeof r === 'bigint') return false;
  return l === r;
}
/** Python ==, including bool/int equality recursively inside lists/dictionaries. */
export function equal(left, right, depth = 0) {
  if (depth > MAX_DEPTH) throw new RangeError('PYTHON_JSON_DEPTH_BOUND');
  const l = typeof left === 'boolean' ? Number(left) : left;
  const r = typeof right === 'boolean' ? Number(right) : right;
  if (isNumeric(l) && isNumeric(r)) return numericEqual(l, r);
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((item, index) => equal(item, right[index], depth + 1));
  if (isRecord(left) || isRecord(right)) return isRecord(left) && isRecord(right) && entries(left).length === entries(right).length &&
    entries(left).every(([key, item]) => own(right, key) && equal(item, right[key], depth + 1));
  return left === right;
}
/** retrieval.typed_equal: scalar numbers compare Decimal(str(...)) keys. */
export function typedEqual(left, right) {
  if (typeof left === 'boolean' || typeof right === 'boolean') return typeof left === typeof right && left === right;
  if (isNumeric(left) && isNumeric(right)) return numberKey(left) === numberKey(right);
  return equal(left, right);
}

// Descriptive aliases for callers outside the producer.
export const parsePythonJson = parsePythonJSON;
export const pythonStr = pyStr;
export const pythonTruthy = pyTruthy;
export const pythonEqual = equal;
export const objectEntries = entries;
export const pythonObject = record;
export function clonePythonJson(value) {
  const active = new Set();
  function clone(item, depth) {
    if (depth > MAX_DEPTH) throw new RangeError('PYTHON_JSON_DEPTH_BOUND');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (isNumeric(item)) { numberString(item); return item; } // Immutable scalars.
    if (!Array.isArray(item) && !isRecord(item)) throw new TypeError('PYTHON_JSON_UNSUPPORTED_VALUE');
    if (active.has(item)) throw new TypeError('PYTHON_JSON_CIRCULAR_VALUE');
    active.add(item);
    const result = Array.isArray(item) ? Array.from({length: item.length}, (_, index) => clone(item[index], depth + 1)) :
      record(entries(item).map(([key, child]) => [key, clone(child, depth + 1)]));
    active.delete(item);
    return result;
  }
  return clone(value, 0);
}
