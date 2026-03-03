import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getChannel,
  getChannelPosts,
  createPost,
  reactToPost,
  getPostComments,
  addComment,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function PostCard({ post, currentUserId, onReact, onCommentClick }) {
  const counts = post.reactionCounts || {};
  const userReacted = post.userReacted;

  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-author-avatar">
          {post.author?.avatar ? (
            <img src={post.author.avatar} alt="" />
          ) : (
            post.author?.username?.[0]?.toUpperCase()
          )}
        </div>
        <div className="post-author-info">
          <span className="post-author-name">{post.author?.username}</span>
          <span className="post-date">
            {new Date(post.createdAt).toLocaleString('ru')}
          </span>
        </div>
      </div>
      <div className="post-content">{post.content}</div>
      <div className="post-footer">
        <span className="post-views">👁 {post.viewCount ?? 0}</span>
        <div className="post-reactions">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={`reaction-btn ${userReacted === emoji ? 'active' : ''}`}
              onClick={() => onReact(post.id, emoji)}
              title={emoji}
            >
              {emoji} {counts[emoji] || ''}
            </button>
          ))}
        </div>
        <button className="btn-comments" onClick={() => onCommentClick(post)}>
          💬 Комментарии ({post.commentCount ?? 0})
        </button>
      </div>
    </div>
  );
}

function CommentThread({ post, onClose, socket }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  useEffect(() => {
    getPostComments(post.id)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [post.id]);

  useEffect(() => {
    if (!socket) return;
    const handler = ({ postId, comment }) => {
      if (postId === post.id) setComments((prev) => [...prev, comment]);
    };
    socket.on('new_comment', handler);
    return () => socket.off('new_comment', handler);
  }, [socket, post.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    addComment(post.id, text.trim())
      .then((c) => setComments((prev) => [...prev, c]))
      .catch(console.error);
    setText('');
  };

  return (
    <div className="comment-thread">
      <header className="comment-thread-header">
        <h3>Комментарии</h3>
        <button className="btn-close-thread" onClick={onClose}>×</button>
      </header>
      <div className="comment-thread-content">
        <div className="comment-original">
          <strong>{post.author?.username}</strong>: {post.content}
        </div>
        <div className="comment-list">
          {loading ? (
            <p>Загрузка...</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="comment-item">
                <div className="comment-avatar">
                  {c.author?.avatar ? (
                    <img src={c.author.avatar} alt="" />
                  ) : (
                    c.author?.username?.[0]?.toUpperCase()
                  )}
                </div>
                <div className="comment-body">
                  <span className="comment-author">{c.author?.username}</span>
                  <span className="comment-text">{c.content}</span>
                  <span className="comment-time">
                    {new Date(c.createdAt).toLocaleString('ru')}
                  </span>
                </div>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать комментарий..."
        />
        <button type="submit" disabled={!text.trim()}>Отправить</button>
      </form>
    </div>
  );
}

export default function ChannelViewPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
  const [channel, setChannel] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postText, setPostText] = useState('');
  const [loading, setLoading] = useState(true);
  const [commentPost, setCommentPost] = useState(null);

  useEffect(() => {
    if (!id) return;
    getChannel(id)
      .then(setChannel)
      .catch(console.error);
    getChannelPosts(id)
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('join_channel', id);
    socket.on('new_post', (post) => {
      if (post.channelId === id) {
        setPosts((prev) => [post, ...prev]);
      }
    });
    socket.on('post_reaction', ({ postId, reactionCounts }) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, reactionCounts } : p
        )
      );
    });
    socket.on('new_comment', ({ postId, comment }) => {
      if (commentPost?.id === postId) {
        setCommentPost((p) => (p ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p));
      }
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
        )
      );
    });
    return () => {
      socket.emit('leave_channel', id);
      socket.off('new_post');
      socket.off('post_reaction');
      socket.off('new_comment');
    };
  }, [socket, id, commentPost?.id]);

  const handleCreatePost = (e) => {
    e.preventDefault();
    if (!postText.trim()) return;
    createPost(id, postText.trim())
      .then((post) => {
        setPosts((prev) => [post, ...prev]);
        setPostText('');
      })
      .catch(console.error);
  };

  const handleReact = (postId, emoji) => {
    reactToPost(postId, emoji)
      .then(({ reactionCounts, userReacted }) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, reactionCounts, userReacted } : p
          )
        );
      })
      .catch(console.error);
  };

  if (!channel) return <div className="loading-screen">Загрузка...</div>;

  const isAdmin = channel.isAdmin;

  return (
    <div className="channel-view-page">
      <header className="channel-view-header">
        <Link to="/channels" className="btn-back">← Каналы</Link>
        <h1>{channel.name}</h1>
        {channel.description && (
          <p className="channel-desc">{channel.description}</p>
        )}
      </header>

      {isAdmin && (
        <form className="post-create-form" onSubmit={handleCreatePost}>
          <textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="Написать пост..."
            rows={3}
          />
          <button type="submit" disabled={!postText.trim()}>
            Опубликовать
          </button>
        </form>
      )}

      <div className="posts-feed">
        {loading ? (
          <p>Загрузка постов...</p>
        ) : posts.length === 0 ? (
          <p className="empty-feed">Пока нет постов</p>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={user?.id}
              onReact={handleReact}
              onCommentClick={(p) => setCommentPost(p)}
            />
          ))
        )}
      </div>

      {commentPost && (
        <div className="comment-thread-overlay" onClick={() => setCommentPost(null)}>
          <div className="comment-thread-modal" onClick={(e) => e.stopPropagation()}>
            <CommentThread post={commentPost} onClose={() => setCommentPost(null)} socket={socket} />
          </div>
        </div>
      )}
    </div>
  );
}
