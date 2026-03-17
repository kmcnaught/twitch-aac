// Default starter phrases — loaded once on first launch if no phrases exist.
// Edit freely; changes only apply to new installs (existing saved phrases are never overwritten).
const SAMPLE_PHRASES = [
  // greetings
  { tag:'greetings', label:'welcome to the stream', starred:true,  phrase:'Welcome to the stream! Hope you\'re ready for some fun!' },
  { tag:'greetings', label:'how are you all',        starred:false, phrase:'Hey everyone! How\'s your day going? Let\'s have some fun!' },
  // about me & accessibility
  { tag:'about me',  label:'introducing myself',     starred:false, phrase:'Hi, my name is Becky! I play games using my eyes and love chatting with you all!' },
  { tag:'about me',  label:'new here intro',         starred:false, phrase:'If you\'re new here, I play games using my eyes — yep, it\'s as cool as it sounds!' },
  { tag:'about me',  label:'fun fact',               starred:false, phrase:'Fun fact: I control everything on my computer with just my eyes!' },
  { tag:'about me',  label:'eye gaze superpower',    starred:false, phrase:'Gaming with eye gaze is like having superpowers, but my weakness is menus!' },
  { tag:'about me',  label:'funny eye gaze moment',  starred:false, phrase:'Sometimes my eyes decide they want to go in the opposite direction. It\'s chaos.' },
  { tag:'about me',  label:'blinking issues',        starred:false, phrase:'If I blink at the wrong moment, things go terribly wrong. It\'s chaos.' },
  { tag:'about me',  label:'why I stream',           starred:false, phrase:'Streaming is my way of showing that gaming is for everyone!' },
  // life
  { tag:'life',      label:'Chip (dog)',             starred:false, phrase:'Shoutout to Chip, my dog, who is probably napping right now. Lucky pup!' },
  { tag:'life',      label:'Chip being lazy',        starred:false, phrase:'Chip is my little sidekick, but let\'s be honest, he does nothing but look cute.' },
  { tag:'life',      label:'thinking about Chip',    starred:false, phrase:'Sometimes I just sit here and wonder… why is Chip so cute?' },
  { tag:'life',      label:'painting',               starred:false, phrase:'Did you know? I paint with my eyes! Yep, I create art just by looking at the screen!' },
  { tag:'life',      label:'boccia',                 starred:false, phrase:'Boccia is a super fun, inclusive sport where you get your ball closest to the white ball!' },
  // banter
  { tag:'banter',    label:'catchphrase (eggs)',     starred:true,  phrase:'I love eggs. That is all. No further questions.' },
  { tag:'banter',    label:'talking about eggs',     starred:false, phrase:'If I could get paid in eggs, I absolutely would. No regrets.' },
  { tag:'banter',    label:'talking about food',     starred:false, phrase:'If I had to pick one food to eat forever… you already know. Eggs.' },
  { tag:'banter',    label:'bad aim excuse',         starred:false, phrase:'If my aim is bad, just blame the eggs. Somehow, it\'s always the eggs.' },
  { tag:'banter',    label:'random laughter',        starred:false, phrase:'If I suddenly start laughing, just assume something funny happened in my head.' },
  { tag:'banter',    label:'something went wrong',   starred:true,  phrase:'Well… that didn\'t go as planned! Moving on!' },
  // chat engagement
  { tag:'chat',      label:'positive vibes',         starred:false, phrase:'Let\'s get some positive vibes going! Who\'s feeling good today?' },
  { tag:'chat',      label:'asking a question',      starred:false, phrase:'Tell me something awesome about your day! I want to hear it!' },
  { tag:'chat',      label:'having fun',             starred:false, phrase:'This is a no-pressure, good vibes only zone. Let\'s just have fun!' },
  { tag:'chat',      label:'ask me anything',        starred:false, phrase:'Got any questions about eye gaze gaming? Ask away! I love chatting!' },
  { tag:'chat',      label:'game suggestions',       starred:false, phrase:'Anyone got any game suggestions? I love trying new things!' },
  { tag:'chat',      label:'need chat\'s help',      starred:false, phrase:'Chat, remind me what I was doing, I got distracted again!' },
  { tag:'chat',      label:'getting hype',           starred:false, phrase:'Let\'s get some hype in the chat! Who\'s excited?' },
  // gaming reactions
  { tag:'gaming',    label:'getting focused',        starred:false, phrase:'Deep breath… focus… okay, let\'s do this!' },
  { tag:'gaming',    label:'celebrating a win',      starred:false, phrase:'If I win this round, I deserve a virtual high-five! Let\'s go!' },
  // events
  { tag:'events',    label:'sub thank you',          starred:false, phrase:'Thank you for subscribing! Welcome, Egglet!' },
  { tag:'events',    label:'tier 2 sub',             starred:false, phrase:'Thank you so much for the Tier 2 sub! You are now a Happy Hatchling!' },
  { tag:'events',    label:'tier 3 sub',             starred:false, phrase:'WOW! Thank you for the Tier 3 sub! You are officially a Golden Yolk!' },
  { tag:'events',    label:'follow',                 starred:false, phrase:'Thanks for the follow! How is chat today? Hope you are all doing well.' },
  { tag:'events',    label:'bits',                   starred:false, phrase:'Thanks for the bits!' },
  { tag:'events',    label:'raid',                   starred:false, phrase:'Thank you for the raid! Hello new friends — I\'m Becky. I have cerebral palsy and I play games using only my eyes. Make yourselves comfy and enjoy the stream!' },
  // goodbyes
  { tag:'goodbyes',  label:'goodbye',                starred:true,  phrase:'Thanks for hanging out! See you next time!' },
  { tag:'goodbyes',  label:'promote socials',        starred:false, phrase:'Please follow me on X, @BeckyLouTyler, and on Instagram, @eyegazegirl.' },
  { tag:'goodbyes',  label:'like and subscribe',     starred:false, phrase:'Please leave a like. And if you\'re new here, remember to subscribe or follow to EyeGazeGirl. See you soon!' },
];
