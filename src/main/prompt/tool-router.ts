/**
 * 工具路由守则：告诉模型「什么时候必须动手，而不是只用嘴描述」。
 *
 * 背景：模型手上有 plot_function / draw_* / run_code 这些真工具，
 * 但提示词里关于工具的说明散在很长的「画图」「实验图」段落里，
 * 位置靠后、语气是「你可以」。实测模型更愿意写一段文字描述图，
 * 而不是真的调用工具 —— 用户看到的就是「说画了，但没有图」。
 *
 * 这里的写法刻意不同：
 *   · 放在提示词靠前的位置（高显著度）
 *   · 用「必须 / 默认先调」的祈使句，而不是「可以」
 *   · 按场景给一张路由表，只列当前真正可用的工具（插件关掉的不提）
 */
interface Route {
  /** 这一行涉及的工具 */
  tools: string[]
  /** 触发场景（给模型看） */
  when: string
}

const ROUTES: Route[] = [
  {
    tools: ['plot_function', 'plot_geometry'],
    when: '函数图像、方程/不等式、几何作图、参数曲线 —— 用 plot_function 或 plot_geometry',
  },
  {
    tools: ['draw_circuit'],
    when: '电路图 —— 必须用 draw_circuit（网表格式见 circuit_spec），不要自己摆方框',
  },
  {
    tools: ['render_experiment'],
    when: '物理/化学/生物的经典装置（单摆、斜面、滴定、光合作用、谱系图）—— 用 render_experiment',
  },
  {
    tools: ['draw_optics', 'draw_apparatus', 'draw_mitosis', 'draw_forces', 'draw_em'],
    when: '透镜成像 / 化学装置 / 细胞分裂 / 受力分析 / 电磁学 —— 用对应的 draw_*（参数见 science_spec）',
  },
  {
    tools: ['draw_diagram'],
    when: '上面预设都没有的示意图 —— 用 draw_diagram 自己摆图元，先调 diagram_spec 看清单',
  },
  {
    tools: ['run_code'],
    when: '需要跑一遍代码验证结果、演示算法或数值 —— 用 run_code（仅工作模式）',
  },
  {
    tools: ['get_current_time'],
    when: '问现在几点、今天几号 —— 用 get_current_time，不要按训练数据猜',
  },
]

/**
 * 按「当前真正可用的工具」生成守则。
 * 插件被关掉时对应那行不出现，避免模型去调一个不存在的工具。
 */
export function buildToolRouterGuide(available: string[]): string {
  const has = new Set(available)
  const rows = ROUTES.filter((r) => r.tools.some((t) => has.has(t)))
  if (!rows.length) return ''

  return [
    '===== 什么时候必须动手（默认先调工具，再讲解）=====',
    '',
    ' 你有真正的工具通道，不是只会写字。下面这些场景**默认先调用工具**，拿到结果再讲解：',
    ...rows.map((r) => '   · ' + r.when),
    '',
    ' 规则：',
    '   · 一次只调一个工具；参数不确定，先调对应的 *_spec 或 experiment_catalog 读格式',
    '   · 工具返回 [chart:c-xxxx] 就**原样**写进回复；不要自己编号，也不要漏写',
    '   · 调用失败：照错误信息改参数**重试一次**；仍失败就直接说明哪一步没画成',
    '   · **不要用文字描述代替图，也不要用 ASCII 图冒充**；更不要写「[工具名]」「<tool_call>」这种假调用',
    '',
  ].join('\n')
}
