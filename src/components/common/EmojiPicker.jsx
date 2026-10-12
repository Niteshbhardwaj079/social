import { useState } from 'react';
import DropdownMenu from './DropdownMenu';
import Icon from './Icon';
import emojiData from '../../config/emojiData';
import { useI18n } from '../../i18n/useI18n';

function EmojiPicker({ onSelect }) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState(emojiData[0].category);
  const activeGroup = emojiData.find((group) => group.category === activeCategory) || emojiData[0];

  return (
    <DropdownMenu
      align="start"
      trigger={
        <button type="button" className="btn btn-icon-sm btn-outline-secondary-custom" title={t('composer.emojiAdd')} aria-label={t('composer.emojiAdd')}>
          <Icon name="Smile" size={16} />
        </button>
      }
      className="p-0"
    >
      {({ close }) => (
        <div className="emoji-picker">
          <div className="emoji-picker__tabs">
            {emojiData.map((group) => {
              const label = t(`composer.emojiCategories.${group.category.toLowerCase()}`);
              return (
                <button
                  key={group.category}
                  type="button"
                  className={`emoji-picker__tab ${group.category === activeCategory ? 'is-active' : ''}`.trim()}
                  onClick={() => setActiveCategory(group.category)}
                  title={label}
                  aria-label={label}
                >
                  <Icon name={group.icon} size={16} />
                </button>
              );
            })}
            <button type="button" className="emoji-picker__close" onClick={close} title={t('composer.emojiClose')} aria-label={t('composer.emojiClose')}>
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
