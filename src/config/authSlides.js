/**
 * The slides on the right side of the sign-in / sign-up pages.
 * To change a picture: put an image (1920 × 1440, 4:3) at public/auth/auth-slide-<number>.png.
 * Until a file exists, the slide shows a placeholder box with the exact size and path to use.
 */
const AUTH_SLIDES = [
  {
    tag: 'Publish',
    title: 'Post everywhere from one place',
    text: 'Write once and publish to Facebook, Instagram, LinkedIn, X, YouTube and more — now or on a schedule.',
  },
  {
    tag: 'AI Studio',
    title: 'Let AI write your posts',
    text: 'Captions, hashtags, images and short videos in seconds — in English, Hindi, Hinglish and 18 more languages.',
  },
  {
    tag: 'Autopilot',
    title: 'Post every day without lifting a finger',
    text: 'Tell the AI what to post about once. It creates a fresh post on schedule and sends it for your approval.',
  },
  {
    tag: 'Inbox',
    title: 'Reply to every comment in one inbox',
    text: 'Comments from all your accounts in one place — assign them to your team and never miss a customer.',
  },
  {
    tag: 'Analytics',
    title: 'See what really works',
    text: 'Real likes, comments, shares and follower growth for every post, on one dashboard.',
  },
  {
    tag: 'Ads',
    title: 'Run Facebook & Instagram ads',
    text: 'Create campaigns, track spend and clicks, and pause what is not working — automatically.',
  },
  {
    tag: 'Team',
    title: 'Work together, safely',
    text: 'Invite your team, choose exactly what each person can do, and approve posts before they go live.',
  },
].map((slide, index) => ({ ...slide, number: index + 1, image: `/auth/auth-slide-${index + 1}.png` }));

export default AUTH_SLIDES;
