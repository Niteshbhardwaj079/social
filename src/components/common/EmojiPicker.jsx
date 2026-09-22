import { useState } from 'react';
import DropdownMenu from './DropdownMenu';
import Icon from './Icon';
import emojiData from '../../config/emojiData';

function EmojiPicker({ onSelect }) {
  const [activeCategory, setActiveCategory] = useState(emojiData[0].category);
  const activeGroup = emojiData.find((group) => group.category === activeCategory) || emojiData[0];

  return (
    <DropdownMenu
      align="start"
      trigger={
        <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" title="Add emoji" aria-label="Add emoji">
          <Icon name="Smile" size={16} />
        </button>
      }
      className="p-0"
    >
      {({ close }) => (
        <div className="emoji-picker">
          <div className="emoji-picker__tabs">
            {emojiData.map((group) => (
              <button
                key={group.category}
                type="button"
                className={`emoji-picker__tab ${group.category === activeCategory ? 'is-active' : ''}`.trim()}
                onClick={() => setActiveCategory(group.category)}
                title={group.category}
                aria-label={group.category}
              >
                <Icon name={group.icon} size={16} />
              </button>
            ))}
            <button type="button" className="emoji-picker__close" onClick={close} title="Close" aria-label="Close emoji picker">
              <Icon name="X" size={14} />
            </button>
          </div>
          <div className="emoji-picker__grid">
            {activeGroup.emojis.map((emoji) => (
              <button key={emoji} type="button" className="emoji-picker__emoji" onClick={() => onSelect(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </DropdownMenu>
  );
}

export default EmojiPicker;
