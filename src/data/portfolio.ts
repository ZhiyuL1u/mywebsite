export type ProjectCategory = 'Full stack' | 'AI & data' | 'Embedded';

export interface ProjectLink {
  label: string;
  url: string;
}

export interface Project {
  id: string;
  title: string;
  subtitle: string;
  category: ProjectCategory;
  image: string;
  summary: string;
  technologies: string[];
  details: string[];
  links: ProjectLink[];
}

// Content restored from the original portfolio; education dates are kept as supplied.
export const profile = {
  name: 'Zhiyu Liu',
  github: 'https://github.com/ZhiyuL1u',
  linkedin: 'https://www.linkedin.com/in/zhiyu-liu-515208281/',
  resume: 'https://docs.google.com/document/d/1RFeWWVAKeMMWVPq2cO2tF8GpTyIL0-jy/edit?usp=sharing&ouid=111177539978422759112&rtpof=true&sd=true',
  portrait: new URL('../assets/about/avatar_about.jpg', import.meta.url).href,
  avatar: new URL('../assets/avatar.jpg', import.meta.url).href,
  wechat: new URL('../assets/wechat.jpg', import.meta.url).href,
  introduction: [
    'My path has taken me from China to the United States, from embedded systems to machine learning, and into full-stack development. At the University of Pennsylvania, my studies brought together computer science and data science.',
    'I came to software through a passion for building, rather than a traditional computer science background. C and C++ led me to Java and Python, and hardware experiments grew into intelligent applications and complete web products.',
    'More than five years of learning across three cities have taught me to keep exploring. I enjoy working through difficult problems, turning ideas into something useful, and getting a little better with every project.',
  ],
};

export const disciplines = [
  {number: '01', name: 'Full-stack systems', description: 'From user interfaces to databases, queues, and deployment.', tools: 'Java · Spring Boot · React · Vue'},
  {number: '02', name: 'Machine learning', description: 'Connecting language, images, and data to useful applications.', tools: 'Python · PyTorch · NLP · Computer vision'},
  {number: '03', name: 'Embedded engineering', description: 'Bringing software into the physical world through sensing and control.', tools: 'C / C++ · STM32 · Raspberry Pi'},
];

export const education = [
  {
    id: 'penn',
    period: 'September 2023 — Present',
    institution: 'University of Pennsylvania',
    role: 'Graduate studies',
    focus: 'Computer science & data science',
    details: [
      'Studied machine learning, deep learning, and statistics through a broad selection of courses.',
      'Applied database coursework to backend development, while continuing to explore full-stack frameworks.',
    ],
  },
  {
    id: 'nottingham-research',
    period: 'September 2022 — September 2023',
    institution: 'University of Nottingham Ningbo China',
    role: 'Undergraduate · GPA 3.8 / 4.0',
    focus: 'Machine learning & software development',
    details: [
      'Expanded from embedded systems into full-stack development and AI research, building on C and C++ with Java, Python, YOLO, and database technology.',
      'Worked on development projects for a fitness community and an Oxford University community, and helped a local hospital train computer vision models.',
    ],
  },
  {
    id: 'nottingham-foundation',
    period: 'September 2019 — September 2022',
    institution: 'University of Nottingham Ningbo China',
    role: 'Undergraduate',
    focus: 'Embedded systems & electronics',
    details: [
      'Built a foundation in mathematics, physics, linear algebra, matrices, and algorithms.',
      'Studied circuits and development boards, learning simulation tools and programming techniques.',
      'Completed embedded projects in the laboratory, including PCB design and fabrication.',
    ],
  },
];

export const projects: Project[] = [
  {
    id: 'divebi',
    title: 'DiveBI',
    subtitle: 'AI-powered business intelligence',
    category: 'AI & data',
    image: new URL('../assets/project/divebi.png', import.meta.url).href,
    summary: 'Turning spreadsheet uploads into AI-generated charts and analysis, backed by an asynchronous processing pipeline.',
    technologies: ['React', 'Ant Design Pro', 'Easy Excel', 'Java', 'Spring Boot', 'MyBatisPlus', 'RabbitMQ', 'Redis', 'MySQL', 'OpenAI API', 'Docker', 'Nginx', 'Google Cloud'],
    details: [
      'Built a business intelligence platform that uses the OpenAI API to analyze uploaded Excel data and generate charts.',
      'Used Redisson for distributed per-user rate limiting to protect shared system resources.',
      'Moved AI generation into a custom I/O-intensive thread pool and task queue for asynchronous processing.',
      'Used RabbitMQ to persist tasks and route them through a Direct exchange to a decoupled generation module. A dead-letter queue handles failed generation tasks.',
    ],
    links: [{label: 'Live website', url: 'https://divebi.com'}, {label: 'Source code', url: 'https://github.com/ZhiyuL1u/diveBi'}],
  },
  {
    id: 'pennguys',
    title: 'Pennguys',
    subtitle: 'A place to exchange knowledge',
    category: 'Full stack',
    image: new URL('../assets/project/pennguys.png', import.meta.url).href,
    summary: 'A complete blogging platform with a reader experience, personal accounts, and a dedicated publishing dashboard.',
    technologies: ['Vue', 'Element UI', 'EasyExcel', 'ECharts', 'Java', 'Spring Boot', 'MyBatisPlus', 'Redis', 'MySQL', 'Docker', 'Nginx', 'Google Cloud'],
    details: [
      'Created a public blog and a separate administration interface for sharing problems and discoveries from study and daily life.',
      'Implemented authentication, post comments, editable user profiles, and real-time view counts with Redis.',
      'Built publishing workflows for saving, editing, and publishing posts, alongside user permission management. Administration access requires approval.',
    ],
    links: [{label: 'Live website', url: 'https://pennguys.com'}, {label: 'Admin dashboard', url: 'https://admin.pennguys.com'}, {label: 'Frontend source', url: 'https://github.com/ZhiyuL1u/myblog_frontend'}],
  },
  {
    id: 'allwhale',
    title: 'AllWhale',
    subtitle: 'Campus life, connected',
    category: 'Full stack',
    image: new URL('../assets/project/allwhale.png', import.meta.url).href,
    summary: 'A WeChat mini program bringing a campus forum and second-hand marketplace into one community experience.',
    technologies: ['Uni-app', 'Vue', 'Java', 'Spring Boot', 'Maven', 'MyBatis', 'WebSocket', 'MySQL', 'Apache Tomcat'],
    details: [
      'Collaborated on a campus community mini program, completed in 2022, combining an online forum and a second-hand trading platform.',
      'Originally called Oxcean, the project became AllWhale. We chose WeChat to introduce the platform to an Oxford university community.',
      'The original WeChat mini program account is AllWhaleLYZ.',
    ],
    links: [{label: 'Source code', url: 'https://github.com/lyuanzhi/AllWhale?tab=readme-ov-file'}],
  },
  {
    id: 'twitrade',
    title: 'Twitrade',
    subtitle: 'Social sentiment meets market data',
    category: 'AI & data',
    image: new URL('../assets/project/twitrade.png', import.meta.url).href,
    summary: 'Exploring the relationship between social media activity around technology companies and stock market performance.',
    technologies: ['React', 'Spring Boot', 'MyBatis', 'Swagger', 'MySQL', 'Pandas', 'NumPy', 'NLP'],
    details: [
      'Developed a tool to explore how social media activity around major technology companies relates to their stock market performance.',
      'Examined likes, comments, and retweets to identify patterns and potential relationships between online sentiment and market movements.',
    ],
    links: [{label: 'Source code', url: 'https://github.com/ZhiyuL1u/Twitrade'}],
  },
  {
    id: 'image-description',
    title: 'Image-Description AI',
    subtitle: 'Bridging vision and language',
    category: 'AI & data',
    image: new URL('../assets/project/IMAGE-DESCRIPTION_AI.png', import.meta.url).href,
    summary: 'An image captioning system that connects convolutional vision models with Transformer-based language generation.',
    technologies: ['Python', 'PyTorch', 'CNNs', 'Transformers', 'NLP', 'Deep learning'],
    details: [
      'Designed an AI system for interpreting and describing images using convolutional neural networks and Transformers.',
      'Explored applications in accessibility, recommendation systems, and the integration of computer vision with natural language processing.',
      'Initial test results demonstrated descriptive image captions. The research paper and reproducible code are available below.',
    ],
    links: [{label: 'Read the paper', url: 'https://drive.google.com/file/d/1paJ2T9YXG6vjIQYR-rI9u8RQcEx-QSe6/view'}, {label: 'Source code', url: 'https://github.com/ZhiyuL1u/IMAGE-DESCRIPTION-AI-BRIDGING-VISION-AND-LANGUAGE-WITH-DEEP'}],
  },
  {
    id: 'spotify',
    title: 'Spotify-themed Web',
    subtitle: 'Music discovery through data',
    category: 'Full stack',
    image: new URL('../assets/project/spotify-themed-web.png', import.meta.url).href,
    summary: 'An interactive music application with a React frontend, a Node.js backend, and a database of songs and playlists.',
    technologies: ['React', 'Node.js', 'MySQL', 'AWS RDS', 'Docker', 'Nginx', 'PM2', 'Google Cloud'],
    details: [
      'Built an interactive Spotify-themed application using React and Node.js, backed by a MySQL RDS database.',
      'Connected an AWS-hosted database containing Taylor Swift songs and playlists, with pagination and data analysis features.',
      'Separated the frontend and backend across servers and used PM2 to keep the Node.js application running.',
    ],
    links: [{label: 'Live website', url: 'https://spotify-themed-web.zhiyuliu.com'}, {label: 'Source code', url: 'https://github.com/ZhiyuL1u/Spotify-themed_web'}],
  },
  {
    id: 'healthcare',
    title: 'Healthcare Dress Detection',
    subtitle: 'Computer vision for clinical settings',
    category: 'AI & data',
    image: new URL('../assets/project/health.png', import.meta.url).href,
    summary: 'A YOLO-based vision model trained to assess clothing standards for healthcare professionals.',
    technologies: ['Python', 'YOLO v3', 'Computer vision', 'Data augmentation'],
    details: [
      'Collected and processed a dataset of healthcare professionals’ clothing, then trained a YOLO model to assess dress standards for hospital use.',
      'Used data augmentation to work with a small dataset and reduce the cost of collecting more images.',
      'The deployment environment constrained the YOLO version. Source code is not publicly available; more project information is linked below.',
    ],
    links: [{label: 'Project information', url: 'https://www.linkedin.com/in/zhiyu-liu-515208281/details/projects/'}],
  },
  {
    id: 'indoor-positioning',
    title: 'Indoor Positioning',
    subtitle: 'Learning to locate with fewer sensors',
    category: 'AI & data',
    image: new URL('../assets/project/indoor.png', import.meta.url).href,
    summary: 'Machine learning and reinforcement learning for ultrasonic positioning accuracy and sensor energy efficiency.',
    technologies: ['Python', 'Ubisense', 'LSTM', 'Reinforcement learning', 'Double DQN'],
    details: [
      'Developed a Python simulation environment for indoor positioning using Ubisense ultrasonic sensors, verified algorithms, and collected training data.',
      'Proposed methods to minimize positioning error, detect non-line-of-sight conditions, and reduce energy use by selectively disabling sensors.',
      'Explored LSTM neural networks, reinforcement learning, and Double DQN. The paper contains the detailed approach.',
    ],
    links: [{label: 'Read the paper', url: 'https://drive.google.com/file/d/18lyaep4CFfpEpIqj37xs1zzSgf7CGYGY/view?usp=sharing'}],
  },
  {
    id: 'vehicle-autonomy',
    title: 'Vehicle Autonomy',
    subtitle: 'Perception, control, and motion',
    category: 'Embedded',
    image: new URL('../assets/project/vehicle.png', import.meta.url).href,
    summary: 'Embedded vehicles combining line following, image and road-sign recognition, and speed monitoring.',
    technologies: ['C / C++', 'Arduino', 'STM32', 'Raspberry Pi', 'OpenCV', 'PID', 'CNNs', 'MATLAB', 'KiCad', 'PLECS', 'LTspice', 'ADS', 'Verilog'],
    details: [
      'Engineered and assembled vehicles using Raspberry Pi and Arduino, implementing PID control for automatic line following.',
      'Combined color and pixel processing with CNN-based methods and developed image recognition algorithms in C++ with OpenCV.',
      'Implemented real-time road-sign recognition from camera streams and integrated a pretrained deep learning model for face recognition.',
    ],
    links: [],
  },
];
