import React from 'react';

export default function StoryRing({ user, onClick }) {
  const seenStories = JSON.parse(localStorage.getItem('seenStories') || '[]');

  const size = 68;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const count = user?.stories?.length || 0;
  const gap = count > 1 ? 4 : 0;
  const segmentLength = count > 0 ? circumference / count - gap : 0;

  const gradientId = `story-gradient-${user?.id || 'default'}`;

  const avatarContent = user?.avatar ? (
    <img
      src={user.avatar}
      alt=""
      className="w-[56px] h-[56px] rounded-full object-cover border-2 border-slate-900"
    />
  ) : (
    <div className="w-[56px] h-[56px] rounded-full bg-blue-500/30 flex items-center justify-center border-2 border-slate-900">
      <span className="text-white font-medium text-lg">
        {user?.username?.[0]?.toUpperCase() || '?'}
      </span>
    </div>
  );

  if (count === 0) {
    return (
      <div
        onClick={onClick}
        className="relative cursor-pointer flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        {avatarContent}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        {user.stories.map((story, i) => {
          const isSeen = seenStories.includes(story.id);
          const offset = (circumference / count) * i;
          return (
            <circle
              key={story.id}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={isSeen ? '#4b5563' : `url(#${gradientId})`}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
              strokeDashoffset={-offset}
              className="transition-all duration-500"
            />
          );
        })}
      </svg>
      <div className="relative flex items-center justify-center">
        {avatarContent}
      </div>
    </div>
  );
}
