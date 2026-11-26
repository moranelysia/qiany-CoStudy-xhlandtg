(() => {
  'use strict'

  const content = document.querySelector('#lesson-content')
  const restart = document.querySelector('#restart')
  const progress = [...document.querySelectorAll('.progress li')]

  const roles = {
    senior: {
      name: '温柔学姐',
      description: '先陪你拆一步，再慢慢往下算。',
      opening: '来，我们一起看看。要把这段式子凑成一个括号的平方，你觉得该补多少？',
      correction: '没关系，我们只看一次项。先想想，6 的一半是多少？',
      square: '前一步已经对了。现在把 3 乘以 3，再试一次。',
      review: '现在换一道题，你可以用同样的方法自己试试。',
    },
    classmate: {
      name: '好奇同桌',
      description: '用追问引你发现规律。',
      opening: '诶，如果它是一个括号的平方，最后那一项会是什么？你先猜一个。',
      correction: '把括号展开时，一次项有两份。那每一份的系数应该是多少？',
      square: '括号里的数是 3，那把括号平方后，两个 3 会怎样相乘？',
      review: '换成 8 会发生什么？试试能不能靠刚才发现的规律做出来。',
    },
  }

  const firstErrors = {
    3: '你找对了 6 的一半。卡在下一步：3 还要平方。',
    6: '你直接补了原来的一次项系数。卡在第一步：先取 6 的一半。',
    36: '你对 6 直接平方了。卡在第一步：先取 6 的一半，再平方。',
  }
  const reviewErrors = {
    4: '你取到了 8 的一半。还差一步，把 4 平方。',
    8: '你直接补了 8。先取一半，再把结果平方。',
    64: '你对 8 直接平方了。先取一半，再平方。',
  }
  const corrections = {
    halve: { formula: '6 ÷ 2 = ?', options: [2, 3, 6], answer: 3, retry: '把 6 平分成两份，再选每一份的数。' },
    square: { formula: '3² = ?', options: [3, 6, 9], answer: 9, retry: '平方的意思是这个数乘以自己。' },
  }

  const fresh = () => ({
    stage: 0, role: null, firstAnswer: null, correctionDone: false,
    reviewFirst: null, reviewAttempts: 0, reviewFeedback: '', correctionFeedback: '',
  })
  let state = fresh()

  function coach(text) {
    const role = roles[state.role]
    return `<p class="coach"><strong>${role.name}</strong>${text}</p>`
  }

  function question(terms) {
    return `<p class="question" aria-label="x 的平方加 ${terms} x 加多少">x² + ${terms}x + ?</p>`
  }

  function choices(action, answers, label) {
    return `<div class="choices" role="group" aria-label="${label}">${answers.map(
      (answer) => `<button class="button" type="button" data-action="${action}" data-value="${answer}">${answer}</button>`,
    ).join('')}</div>`
  }

  function feedback(text, correct = false) {
    return `<p class="feedback${correct ? ' correct' : ''}" role="status">${text}</p>`
  }

  function action(text, name, primary = true) {
    return `<button type="button" class="button${primary ? ' primary' : ''}" data-action="${name}">${text}</button>`
  }

  function roleSelection() {
    return `<h3 tabindex="-1">选一位搭子开始</h3>
      <div class="role-options">
        ${Object.entries(roles).map(([id, role]) => `<button class="button role" type="button" data-action="role" data-value="${id}">
          <strong>${role.name}</strong><span>${role.description}</span>
        </button>`).join('')}
      </div>`
  }

  function firstQuestion() {
    if (state.firstAnswer === null) {
      return `<h3 tabindex="-1">要让它成为完全平方，应该补多少？</h3>
        ${question(6)}${coach(roles[state.role].opening)}
        ${choices('first', [3, 9, 6, 36], '第一题答案')}`
    }
    const correctOnFirstTry = state.firstAnswer === 9
    if (correctOnFirstTry || state.correctionDone) {
      return `<h3 tabindex="-1">${correctOnFirstTry ? '第一题答对了' : '这一步订正成功'}</h3>
        ${feedback('先算 6 ÷ 2 = 3，再算 3² = 9。补上 9，就得到 (x + 3)²。', true)}
        <div class="actions">${action('做一道同类题 →', 'review')}</div>`
    }
    const step = state.firstAnswer === 3 ? 'square' : 'halve'
    const exercise = corrections[step]
    return `<h3 tabindex="-1">先补上漏掉的步骤</h3>
      ${feedback(firstErrors[state.firstAnswer])}
      ${coach(step === 'square' ? roles[state.role].square : roles[state.role].correction)}
      <p class="question">${exercise.formula}</p>
      ${choices('correction', exercise.options, '订正题答案')}
      ${state.correctionFeedback ? feedback(state.correctionFeedback) : ''}`
  }

  function reviewQuestion() {
    return `<h3 tabindex="-1">${state.reviewFeedback ? '再试一次同类题' : '换一道，你能自己做吗？'}</h3>
      ${question(8)}${coach(roles[state.role].review)}
      ${state.reviewFeedback ? feedback(state.reviewFeedback) : ''}
      ${choices('review-answer', [4, 16, 8, 64], '同类复测答案')}`
  }

  function result() {
    const firstCorrect = state.firstAnswer === 9
    const independent = state.reviewAttempts === 1
    const firstLine = firstCorrect ? '首次选 9，答对' : `首次选 ${state.firstAnswer}，已完成订正`
    const reviewLine = independent ? '首次选 16，独立答对' : `首次选 ${state.reviewFirst}，第 ${state.reviewAttempts} 次选 16，提示后答对`
    return `<h3 tabindex="-1">${independent ? '你独立做对了同类题' : '你在提示后做对了同类题'}</h3>
      ${feedback('先取一次项系数的一半，再平方。复测中 8 ÷ 2 = 4，因此补 16。', true)}
      <p>${firstCorrect ? '两道题都已做完。' : '从发现卡点到订正，再到用同一方法解新题，你完成了一轮练习。'}</p>
      <details class="report">
        <summary>查看本次学习报告</summary>
        <dl>
          <dt>伴学搭子</dt><dd>${roles[state.role].name}</dd>
          <dt>知识点</dt><dd>配方法：构造完全平方</dd>
          <dt>第一题</dt><dd>${firstLine}</dd>
          <dt>错步记录</dt><dd>${firstCorrect ? '第一题没有错步。' : firstErrors[state.firstAnswer]}</dd>
          <dt>同类复测</dt><dd>${reviewLine}</dd>
        </dl>
      </details>
      <div class="actions">${action('换个角色再试', 'restart', false)}</div>`
  }

  function render(focus = true) {
    const scenes = [roleSelection, firstQuestion, reviewQuestion, result]
    content.innerHTML = scenes[state.stage]()
    progress.forEach((step, i) => {
      if (i === state.stage) step.setAttribute('aria-current', 'step')
      else step.removeAttribute('aria-current')
      step.classList.toggle('done', i < state.stage)
    })
    restart.hidden = state.stage === 0
    if (focus) content.querySelector('h3').focus()
  }

  function reset() {
    state = fresh()
    render()
  }

  content.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]')
    if (!button) return
    const { action: name, value } = button.dataset
    const answer = Number(value)
    switch (name) {
      case 'role':
        state.role = value
        state.stage = 1
        break
      case 'first':
        state.firstAnswer = answer
        break
      case 'correction': {
        const exercise = corrections[state.firstAnswer === 3 ? 'square' : 'halve']
        state.correctionDone = answer === exercise.answer
        state.correctionFeedback = exercise.retry
        break
      }
      case 'review':
        state.stage = 2
        break
      case 'review-answer':
        state.reviewFirst ??= answer
        state.reviewAttempts += 1
        if (answer === 16) state.stage = 3
        else state.reviewFeedback = reviewErrors[answer]
        break
      case 'restart':
        reset()
        return
      default:
        return
    }
    render()
  })

  restart.addEventListener('click', reset)
  render(false)
})()
