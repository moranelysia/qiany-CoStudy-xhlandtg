/* ==========================================================
   Shared data model for the three variants.
   Real product-shaped content — no lorem ipsum.
   ========================================================== */

/** 12 personality dimensions, each an opposing axis (0 = left pole, 100 = right pole) */
export const DIMS = [
  { key: 'warmth',   label: '热情',     left: '清冷', right: '热情', value: 78, hint: '语气与反馈的积极程度' },
  { key: 'formality',label: '正式度',   left: '轻松', right: '正式', value: 24, hint: '用词与句式，是否加称呼' },
  { key: 'humor',    label: '幽默感',   left: '严肃', right: '爱开玩笑', value: 62, hint: '是否用类比和玩笑调节气氛' },
  { key: 'patience', label: '耐心',     left: '直接推进', right: '反复陪讲', value: 86, hint: '同一概念重复解释的意愿' },
  { key: 'strict',   label: '严格度',   left: '宽容', right: '严格', value: 28, hint: '指出错误的方式与要求' },
  { key: 'proactive',label: '主动性',   left: '被动应答', right: '主动引导', value: 55, hint: '是否主动提问、主动给计划' },
  { key: 'praise',   label: '鼓励密度', left: '少夸', right: '常夸', value: 70, hint: '正反馈频率' },
  { key: 'verbosity',label: '话量',     left: '简短', right: '健谈', value: 42, hint: '单轮回答长度' },
  { key: 'abstract', label: '抽象度',   left: '具体例子', right: '原理概念', value: 35, hint: '从具象还是抽象切入' },
  { key: 'tempo',    label: '语速感',   left: '慢条斯理', right: '干脆利落', value: 48, hint: '句子长度与停顿' },
  { key: 'closeness',label: '亲和力',   left: '克制', right: '亲密', value: 66, hint: '是否用亲昵称呼、关心日常' },
  { key: 'stability',label: '稳定度',   left: '情绪外显', right: '平和稳定', value: 72, hint: '语气起伏幅度' },
];

/** teaching orientation — orthogonal to personality */
export const TEACHING = [
  { key: 'explain',  left: '纯提问', right: '纯讲解', value: 38, hint: '讲解与引导的比例' },
  { key: 'socratic', on: true,  label: '苏格拉底式提问', hint: '用反问推进，而不是直接给答案' },
  { key: 'diagnose', on: true,  label: '先诊断再教', hint: '开始前先探测真实水平' },
  { key: 'review',   on: true,  label: '主动提复习', hint: '记得上次没弄懂的地方' },
];

export const STAGE_OPTIONS = ['小学', '初中', '高中', '大学', '成人自学', '不限'];
export const EXERCISE_OPTIONS = ['少', '中', '多'];
export const ERROR_OPTIONS = ['立刻纠正', '让他先试完', '引导自检'];

/** ready-made cards — neutral originals, no third-party IP */
export const TEMPLATES = [
  { id: 'senior',    name: '温柔学姐',   emoji: '🌸', line: '耐心、会换着说法讲，直到你真的懂', tone: 'warm' },
  { id: 'coach',     name: '严格教练',   emoji: '🎯', line: '盯练习、不当好人，但绝不糊弄你',   tone: 'cool' },
  { id: 'quiet',     name: '话少学霸',   emoji: '📘', line: '不寒暄，直接给结构和干货',         tone: 'plain' },
  { id: 'neighbor',  name: '邻家哥哥',   emoji: '🌿', line: '满脑子生活例子，把抽象讲成具体',   tone: 'warm' },
  { id: 'peer',      name: '好奇同桌',   emoji: '💬', line: '什么都想问你一句，一起把题聊明白', tone: 'play' },
  { id: 'prof',      name: '沉稳老教授', emoji: '🕯', line: '重推导、重来源，慢但一次讲透',     tone: 'cool' },
  { id: 'rival',     name: '竞争型搭档', emoji: '⚡', line: '跟你比着做题，错了会直接指出来',   tone: 'play' },
  { id: 'librarian', name: '安静图书管理员', emoji: '📚', line: '话不多，但总能翻到你需要的那页', tone: 'plain' },
];

/** per-template slider presets */
export const PRESETS = {
  senior:   { warmth: 82, formality: 22, humor: 60, patience: 88, strict: 26, proactive: 54, praise: 76, verbosity: 46, abstract: 32, tempo: 46, closeness: 70, stability: 74 },
  coach:    { warmth: 36, formality: 46, humor: 30, patience: 42, strict: 88, proactive: 80, praise: 24, verbosity: 38, abstract: 58, tempo: 72, closeness: 30, stability: 82 },
  quiet:    { warmth: 26, formality: 58, humor: 14, patience: 55, strict: 60, proactive: 34, praise: 18, verbosity: 16, abstract: 74, tempo: 64, closeness: 20, stability: 88 },
  neighbor: { warmth: 88, formality: 12, humor: 78, patience: 78, strict: 20, proactive: 62, praise: 72, verbosity: 62, abstract: 18, tempo: 44, closeness: 78, stability: 60 },
  peer:     { warmth: 76, formality: 10, humor: 72, patience: 62, strict: 16, proactive: 88, praise: 64, verbosity: 58, abstract: 40, tempo: 66, closeness: 74, stability: 52 },
  prof:     { warmth: 40, formality: 86, humor: 24, patience: 84, strict: 66, proactive: 46, praise: 30, verbosity: 72, abstract: 84, tempo: 30, closeness: 26, stability: 92 },
  rival:    { warmth: 52, formality: 18, humor: 66, patience: 34, strict: 74, proactive: 82, praise: 34, verbosity: 44, abstract: 52, tempo: 80, closeness: 58, stability: 48 },
  librarian:{ warmth: 34, formality: 62, humor: 20, patience: 80, strict: 40, proactive: 28, praise: 36, verbosity: 22, abstract: 70, tempo: 34, closeness: 32, stability: 90 },
};

/** realistic learning content: today's lesson on quadratic equations */
export const LESSON = {
  course: '数学 · 一元二次方程',
  goal: '弄懂求根公式是怎么来的，能自己解出带分数根的题',
  points: [
    { id: 'kp1', name: '配方法推导',      mastery: 0.82, state: 'done' },
    { id: 'kp2', name: '判别式 Δ 的意义',  mastery: 0.55, state: 'doing' },
    { id: 'kp3', name: '根与系数关系',     mastery: 0.18, state: 'todo' },
    { id: 'kp4', name: '实际应用题',       mastery: 0.05, state: 'todo' },
  ],
  errors: [
    { id: 'e1', text: '移项时符号没变', point: '判别式 Δ 的意义', when: '昨天', repeat: 2 },
    { id: 'e2', text: '把 b²−4ac 写成 b²+4ac', point: '配方法推导', when: '3 天前', repeat: 1 },
  ],
  review: [
    { id: 'r1', text: '完全平方公式的三个变体', due: '今天', point: '配方法推导' },
    { id: 'r2', text: '负数开平方的取值范围',   due: '今天', point: '判别式 Δ 的意义' },
  ],
  profile: {
    stage: '高中',
    habit: '习惯先看结论再回头抠过程',
    strength: '代数变形稳，计算很少出错',
    weakness: '对「为什么」不敏感，容易背公式',
    pace: '每次约 35 分钟，晚上 8 点后状态最好',
  },
};

/** the questions the preview answers */
export const PREVIEW_PROMPTS = [
  '我不懂这道题，x² − 5x + 6 = 0 怎么解？',
  '我还是没懂，能不能换个说法？',
  '这个求根公式到底为什么要背？',
];

/** canned replies per template, so the preview demonstrably changes */
export const REPLIES = {
  senior: [
    '别急，我们一起看。x² − 5x + 6 = 0 这个式子，你先试试能不能拆成两个括号相乘？你脑子里现在冒出来的两个数是什么？',
    '好，换个说法：你是在找一个「两数相加等于 5、相乘等于 6」的组合。这种题我们昨天其实碰到过一个很像的，你还记得当时是怎么凑出来的吗？',
    '问得好。求根公式不是让你背的，它是配方法推到一半自然掉出来的结果。要不我们先把它推一遍？推完你就知道它凭什么长这样。',
  ],
  coach: [
    '先别问解法。这个式子你打算用什么方法？说出来，然后自己做，做完我判。',
    '换个角度重来一遍。把 5 拆成两个数，自己写在纸上，别在脑子里空转。',
    '不用背。你只要能在 30 秒内推出来就行。现在计时，开始。',
  ],
  quiet: [
    '十字相乘法。−2 和 −3。根是 2、3。',
    '判别式法：Δ = 25 − 24 = 1，x = (5 ± 1)/2。本质是配方法的简化。',
    '求根公式由配方法导出。推导：移项 → 配方 → 开方 → 整理。',
  ],
  neighbor: [
    '来，把它想成摆摊。你有 6 个苹果要分给两个人，两人拿的数量加起来是 5 个。那这俩人各拿几个？是不是一下就出来了？',
    '这么说吧：x²−5x+6 就像「两个数相加 5、相乘 6」。你找找哪两个数这么听话？',
    '因为它是「配方」出来的副产品。就像你做菜最后剩下的那勺汤——不是特意做的，是做的时候自然留下的。',
  ],
  peer: [
    '诶这题我也有点好奇，你先说说你卡在哪？是不知道从哪下手，还是算到一半卡住了？',
    '我换个问法：如果只能拆成两个括号，你猜括号里大概长什么样？',
    '我也想过这个问题！你猜它是怎么来的——是先有公式还是先有配方法？',
  ],
  prof: [
    '我们从头推导。首先把常数项移到右边，然后两边同时加上一次项系数一半的平方。你跟着我写，第一步写完告诉我。',
    '换一个等价表述：我们要求的是使多项式为零的两个实根，这等价于把它分解为两个一次因式的乘积。',
    '求根公式是配方法的直接推论，不是独立结论。它的推导过程本身比结论更重要，所以我们完整推一遍。',
  ],
  rival: [
    '这题我 20 秒能出答案。你先来，我给你 40 秒，输的人请奶茶。',
    '别绕了。你在「拆项」这一步犹豫了，就是没背熟因式分解的几种套路。再来一遍，这次不许停顿。',
    '背？行，那你推一遍给我看。推不出来说明你只是记住了符号，没记住为什么。',
  ],
  librarian: [
    '十字相乘法。参考：因式分解章节第 3 节。',
    '等价表述：寻找两个数，和为 5，积为 6。',
    '公式来源：配方法。见推导笔记第 2 页。',
  ],
};
