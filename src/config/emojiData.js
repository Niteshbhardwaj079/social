// A curated set of standard Unicode emoji — the same characters every major
// social platform renders natively, so nothing here needs platform-specific
// handling. Kept to the emoji people actually reach for in a marketing post
// rather than the full multi-thousand-character Unicode set.
const emojiData = [
  {
    category: 'Smileys',
    icon: 'Smile',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '😎', '🥳', '😏', '😴', '🤔', '🤗', '🙄', '😬', '😢', '😭', '😤', '😡', '🥺'],
  },
  {
    category: 'Gestures',
    icon: 'Hand',
    emojis: ['👍', '👎', '👏', '🙌', '🙏', '🤝', '💪', '👋', '✌️', '🤞', '🤟', '🤙', '👌', '👊', '✋', '🫶', '🫡', '🤲', '👉', '👈', '☝️', '💯', '🔥', '✨'],
  },
  {
    category: 'People',
    icon: 'User',
    emojis: ['🧑‍💻', '👩‍💼', '👨‍💼', '🧑‍🎨', '👩‍🚀', '🕺', '💃', '🤝', '👥', '🗣️', '👤', '🧑‍🤝‍🧑'],
  },
  {
    category: 'Nature',
    icon: 'Leaf',
    emojis: ['🌟', '⭐', '🌈', '☀️', '⛅', '🌙', '🔥', '💧', '🌊', '🌸', '🌼', '🌻', '🌱', '🍀', '🐶', '🐱', '🦋', '🐝'],
  },
  {
    category: 'Food',
    icon: 'Coffee',
    emojis: ['☕', '🍕', '🍔', '🍟', '🍩', '🍰', '🎂', '🍫', '🍿', '🥂', '🍾', '🍹', '🥤', '🍦'],
  },
  {
    category: 'Activities',
    icon: 'PartyPopper',
    emojis: ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🎯', '🎮', '🎧', '🎤', '📸', '🎬', '⚽', '🏀', '🎨'],
  },
  {
    category: 'Travel',
    icon: 'Plane',
    emojis: ['✈️', '🚀', '🚗', '🏝️', '🗺️', '📍', '🏔️', '🌍', '🏢', '🏠', '🚦', '⏰', '📅'],
  },
  {
    category: 'Objects',
    icon: 'Lightbulb',
    emojis: ['💡', '📱', '💻', '📷', '🎥', '📈', '📊', '💰', '💳', '🛒', '📦', '🔔', '📢', '📣', '🔗', '✅', '❌', '⚡'],
  },
  {
    category: 'Symbols',
    icon: 'Heart',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💖', '💫', '❗', '❓', '💬', '👀', '🆕', '🔝'],
  },
];

export default emojiData;
