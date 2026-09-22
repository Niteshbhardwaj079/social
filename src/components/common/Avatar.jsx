function getInitials(name = '') {
  const parts = name.trim().split(' ').filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function Avatar({ name, imageUrl, size = 'md', className = '' }) {
  return (
    <span className={`avatar avatar--${size} ${className}`.trim()}>
      {imageUrl ? <img src={imageUrl} alt={name} /> : getInitials(name)}
    </span>
  );
}

export default Avatar;
