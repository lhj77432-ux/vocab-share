export type WordCategory =
  | '教育学习'
  | '社会议题'
  | '环境科技'
  | '情感态度'
  | '描述评价'
  | '动作行为'
  | '抽象概念'

export interface VocabWord {
  id: string
  word: string
  phonetic?: string
  pos: string
  meaningZh: string
  example: string
  category: WordCategory
  /** DSE paper / theme hint */
  theme?: string
}

/** HK DSE English oriented demo list (~70 words) */
export const DEMO_LIST_ID = 'dse-demo-v1'
export const DEMO_LIST_TITLE = 'DSE English 示范词表'

export const demoWords: VocabWord[] = [
  { id: 'w1', word: 'compulsory', pos: 'adj.', meaningZh: '强制的；义务的', example: 'English is a compulsory subject in most DSE schools.', category: '教育学习', theme: 'Education' },
  { id: 'w2', word: 'curriculum', pos: 'n.', meaningZh: '课程', example: 'The school revised its curriculum to include more STEM subjects.', category: '教育学习', theme: 'Education' },
  { id: 'w3', word: 'assessment', pos: 'n.', meaningZh: '评估；考核', example: 'Continuous assessment reduces exam pressure for students.', category: '教育学习', theme: 'Education' },
  { id: 'w4', word: 'plagiarism', pos: 'n.', meaningZh: '抄袭', example: 'Universities take plagiarism very seriously.', category: '教育学习', theme: 'Education' },
  { id: 'w5', word: 'discipline', pos: 'n.', meaningZh: '纪律；学科', example: 'Self-discipline is essential for exam preparation.', category: '教育学习', theme: 'Education' },
  { id: 'w6', word: 'tuition', pos: 'n.', meaningZh: '学费；补习', example: 'Many students attend tuition centres after school.', category: '教育学习', theme: 'Education' },
  { id: 'w7', word: 'literacy', pos: 'n.', meaningZh: '读写能力', example: 'Media literacy helps teenagers judge online information.', category: '教育学习', theme: 'Education' },
  { id: 'w8', word: 'peer pressure', pos: 'n.', meaningZh: '同辈压力', example: 'Peer pressure can influence teenagers’ lifestyle choices.', category: '社会议题', theme: 'Youth' },
  { id: 'w9', word: 'stereotype', pos: 'n.', meaningZh: '刻板印象', example: 'We should not judge people based on stereotypes.', category: '社会议题', theme: 'Society' },
  { id: 'w10', word: 'discrimination', pos: 'n.', meaningZh: '歧视', example: 'Laws protect citizens from unfair discrimination.', category: '社会议题', theme: 'Society' },
  { id: 'w11', word: 'poverty', pos: 'n.', meaningZh: '贫穷', example: 'Education is often seen as a way out of poverty.', category: '社会议题', theme: 'Society' },
  { id: 'w12', word: 'volunteer', pos: 'n./v.', meaningZh: '志愿者；自愿做', example: 'She volunteers at a local elderly centre every weekend.', category: '社会议题', theme: 'Community' },
  { id: 'w13', word: 'civic', pos: 'adj.', meaningZh: '公民的', example: 'Civic education encourages responsible citizenship.', category: '社会议题', theme: 'Society' },
  { id: 'w14', word: 'controversy', pos: 'n.', meaningZh: '争议', example: 'The policy sparked controversy among parents.', category: '社会议题', theme: 'Society' },
  { id: 'w15', word: 'legislation', pos: 'n.', meaningZh: '立法；法规', example: 'New legislation aims to protect personal data.', category: '社会议题', theme: 'Society' },
  { id: 'w16', word: 'sustainable', pos: 'adj.', meaningZh: '可持续的', example: 'Cities need sustainable transport systems.', category: '环境科技', theme: 'Environment' },
  { id: 'w17', word: 'emission', pos: 'n.', meaningZh: '排放', example: 'Reducing carbon emissions is a global priority.', category: '环境科技', theme: 'Environment' },
  { id: 'w18', word: 'recycle', pos: 'v.', meaningZh: '回收再用', example: 'Hong Kong encourages residents to recycle plastic bottles.', category: '环境科技', theme: 'Environment' },
  { id: 'w19', word: 'biodiversity', pos: 'n.', meaningZh: '生物多样性', example: 'Protecting biodiversity helps ecosystems stay healthy.', category: '环境科技', theme: 'Environment' },
  { id: 'w20', word: 'innovation', pos: 'n.', meaningZh: '创新', example: 'Innovation drives the growth of the tech industry.', category: '环境科技', theme: 'Technology' },
  { id: 'w21', word: 'artificial intelligence', pos: 'n.', meaningZh: '人工智能', example: 'Artificial intelligence is changing how we learn and work.', category: '环境科技', theme: 'Technology' },
  { id: 'w22', word: 'cyberbullying', pos: 'n.', meaningZh: '网络欺凌', example: 'Schools should educate students about cyberbullying.', category: '环境科技', theme: 'Technology' },
  { id: 'w23', word: 'privacy', pos: 'n.', meaningZh: '隐私', example: 'Users should protect their online privacy.', category: '环境科技', theme: 'Technology' },
  { id: 'w24', word: 'addiction', pos: 'n.', meaningZh: '成瘾', example: 'Smartphone addiction affects sleep quality.', category: '环境科技', theme: 'Health' },
  { id: 'w25', word: 'anxious', pos: 'adj.', meaningZh: '焦虑的', example: 'Many candidates feel anxious before public exams.', category: '情感态度', theme: 'Emotions' },
  { id: 'w26', word: 'frustrated', pos: 'adj.', meaningZh: '沮丧的；受挫的', example: 'He felt frustrated after failing the mock test.', category: '情感态度', theme: 'Emotions' },
  { id: 'w27', word: 'optimistic', pos: 'adj.', meaningZh: '乐观的', example: 'She remains optimistic about her future career.', category: '情感态度', theme: 'Emotions' },
  { id: 'w28', word: 'empathy', pos: 'n.', meaningZh: '同理心', example: 'Empathy helps us understand other people’s feelings.', category: '情感态度', theme: 'Emotions' },
  { id: 'w29', word: 'motivation', pos: 'n.', meaningZh: '动机；动力', example: 'Clear goals can increase students’ motivation.', category: '情感态度', theme: 'Emotions' },
  { id: 'w30', word: 'resilience', pos: 'n.', meaningZh: '抗逆力；韧性', example: 'Resilience helps teenagers recover from setbacks.', category: '情感态度', theme: 'Emotions' },
  { id: 'w31', word: 'significant', pos: 'adj.', meaningZh: '重要的；显著的', example: 'There was a significant improvement in her writing.', category: '描述评价', theme: 'Academic' },
  { id: 'w32', word: 'adequate', pos: 'adj.', meaningZh: '足够的；适当的', example: 'Students need adequate rest during the exam period.', category: '描述评价', theme: 'Academic' },
  { id: 'w33', word: 'beneficial', pos: 'adj.', meaningZh: '有益的', example: 'Regular reading is beneficial to vocabulary growth.', category: '描述评价', theme: 'Academic' },
  { id: 'w34', word: 'detrimental', pos: 'adj.', meaningZh: '有害的', example: 'Lack of sleep can be detrimental to concentration.', category: '描述评价', theme: 'Academic' },
  { id: 'w35', word: 'controversial', pos: 'adj.', meaningZh: '有争议的', example: 'School uniform rules remain a controversial topic.', category: '描述评价', theme: 'Academic' },
  { id: 'w36', word: 'feasible', pos: 'adj.', meaningZh: '可行的', example: 'The proposal is ambitious but still feasible.', category: '描述评价', theme: 'Academic' },
  { id: 'w37', word: 'inevitable', pos: 'adj.', meaningZh: '不可避免的', example: 'Some stress before exams is almost inevitable.', category: '描述评价', theme: 'Academic' },
  { id: 'w38', word: 'reliable', pos: 'adj.', meaningZh: '可靠的', example: 'Always use reliable sources in your writing.', category: '描述评价', theme: 'Academic' },
  { id: 'w39', word: 'enhance', pos: 'v.', meaningZh: '提升；增强', example: 'Practice can enhance your speaking fluency.', category: '动作行为', theme: 'Academic' },
  { id: 'w40', word: 'undermine', pos: 'v.', meaningZh: '削弱；损害', example: 'Cheating undermines the fairness of exams.', category: '动作行为', theme: 'Academic' },
  { id: 'w41', word: 'alleviate', pos: 'v.', meaningZh: '减轻；缓解', example: 'Exercise can alleviate exam stress.', category: '动作行为', theme: 'Health' },
  { id: 'w42', word: 'persuade', pos: 'v.', meaningZh: '说服', example: 'The article aims to persuade readers to recycle more.', category: '动作行为', theme: 'Writing' },
  { id: 'w43', word: 'justify', pos: 'v.', meaningZh: '证明合理；为…辩解', example: 'Candidates must justify their opinions with examples.', category: '动作行为', theme: 'Writing' },
  { id: 'w44', word: 'illustrate', pos: 'v.', meaningZh: '说明；举例说明', example: 'Please illustrate your point with a local example.', category: '动作行为', theme: 'Writing' },
  { id: 'w45', word: 'evaluate', pos: 'v.', meaningZh: '评价；评估', example: 'Evaluate the advantages and disadvantages carefully.', category: '动作行为', theme: 'Writing' },
  { id: 'w46', word: 'propose', pos: 'v.', meaningZh: '提议', example: 'I propose that schools extend library opening hours.', category: '动作行为', theme: 'Writing' },
  { id: 'w47', word: 'implement', pos: 'v.', meaningZh: '实施', example: 'It is hard to implement new policies overnight.', category: '动作行为', theme: 'Society' },
  { id: 'w48', word: 'consequence', pos: 'n.', meaningZh: '后果', example: 'Skipping lessons may have serious consequences.', category: '抽象概念', theme: 'Academic' },
  { id: 'w49', word: 'perspective', pos: 'n.', meaningZh: '观点；视角', example: 'Try to consider the issue from another perspective.', category: '抽象概念', theme: 'Writing' },
  { id: 'w50', word: 'priority', pos: 'n.', meaningZh: '优先事项', example: 'Health should be a top priority for teenagers.', category: '抽象概念', theme: 'Society' },
  { id: 'w51', word: 'phenomenon', pos: 'n.', meaningZh: '现象', example: 'Social media addiction is a common phenomenon.', category: '抽象概念', theme: 'Society' },
  { id: 'w52', word: 'assumption', pos: 'n.', meaningZh: '假设；假定', example: 'Do not base your argument on a false assumption.', category: '抽象概念', theme: 'Writing' },
  { id: 'w53', word: 'implication', pos: 'n.', meaningZh: '含义；影响', example: 'The implication of the study is clear.', category: '抽象概念', theme: 'Academic' },
  { id: 'w54', word: 'criterion', pos: 'n.', meaningZh: '标准（复数 criteria）', example: 'One key criterion is clarity of expression.', category: '抽象概念', theme: 'Academic' },
  { id: 'w55', word: 'evidence', pos: 'n.', meaningZh: '证据', example: 'Support your claim with concrete evidence.', category: '抽象概念', theme: 'Writing' },
  { id: 'w56', word: 'argument', pos: 'n.', meaningZh: '论点；论据', example: 'A balanced argument considers both sides.', category: '抽象概念', theme: 'Writing' },
  { id: 'w57', word: 'coherent', pos: 'adj.', meaningZh: '连贯的', example: 'A coherent paragraph has a clear topic sentence.', category: '描述评价', theme: 'Writing' },
  { id: 'w58', word: 'concise', pos: 'adj.', meaningZh: '简洁的', example: 'Keep your summary concise and accurate.', category: '描述评价', theme: 'Writing' },
  { id: 'w59', word: 'elaborate', pos: 'v./adj.', meaningZh: '详细说明；详尽的', example: 'Please elaborate on your second reason.', category: '动作行为', theme: 'Writing' },
  { id: 'w60', word: 'acknowledge', pos: 'v.', meaningZh: '承认；致谢', example: 'Writers should acknowledge opposing views.', category: '动作行为', theme: 'Writing' },
  { id: 'w61', word: 'compulsory education', pos: 'n.', meaningZh: '义务教育', example: 'Hong Kong provides free compulsory education.', category: '教育学习', theme: 'Education' },
  { id: 'w62', word: 'extracurricular', pos: 'adj.', meaningZh: '课外的', example: 'Extracurricular activities develop soft skills.', category: '教育学习', theme: 'Education' },
  { id: 'w63', word: 'well-being', pos: 'n.', meaningZh: '身心健康；福祉', example: 'Schools should care about students’ well-being.', category: '情感态度', theme: 'Health' },
  { id: 'w64', word: 'sedentary', pos: 'adj.', meaningZh: '久坐的', example: 'A sedentary lifestyle increases health risks.', category: '环境科技', theme: 'Health' },
  { id: 'w65', word: 'obesity', pos: 'n.', meaningZh: '肥胖', example: 'Junk food can contribute to childhood obesity.', category: '环境科技', theme: 'Health' },
  { id: 'w66', word: 'nutritious', pos: 'adj.', meaningZh: '有营养的', example: 'A nutritious breakfast improves concentration.', category: '环境科技', theme: 'Health' },
  { id: 'w67', word: 'urbanisation', pos: 'n.', meaningZh: '城市化', example: 'Rapid urbanisation puts pressure on housing.', category: '社会议题', theme: 'Society' },
  { id: 'w68', word: 'heritage', pos: 'n.', meaningZh: '遗产；传统', example: 'We should preserve our cultural heritage.', category: '社会议题', theme: 'Culture' },
  { id: 'w69', word: 'multicultural', pos: 'adj.', meaningZh: '多元文化的', example: 'Hong Kong is a multicultural city.', category: '社会议题', theme: 'Culture' },
  { id: 'w70', word: 'tolerance', pos: 'n.', meaningZh: '包容；容忍', example: 'Mutual tolerance makes society more harmonious.', category: '情感态度', theme: 'Society' },
]

export const ALL_CATEGORIES: WordCategory[] = [
  '教育学习',
  '社会议题',
  '环境科技',
  '情感态度',
  '描述评价',
  '动作行为',
  '抽象概念',
]
