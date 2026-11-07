import { useState } from 'react';
import {
  Star,
  X,
  Send,
  Check,
  Zap,
  FileText,
  Receipt,
  CreditCard,
  BarChart3,
  HandHeart,
  Flame,
  Rocket,
  ThumbsUp,
  Wrench,
  Frown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { getErrorMessage } from '@/lib/axios.ts';
import { useReviewPrompt } from '@/hooks/useReviewPrompt.ts';

const SENTIMENT_CHIPS = [
  { label: 'Super Fast', icon: Zap },
  { label: 'Clean Invoices', icon: FileText },
  { label: 'Smooth Tax Filings', icon: Receipt },
  { label: 'Virtual Store Cards', icon: CreditCard },
  { label: 'Clear Reports', icon: BarChart3 },
  { label: 'Easy Setup', icon: HandHeart },
];

const STAR_REACTIONS: Record<number, { text: string; icon: any }> = {
  5: { text: 'Oshey! Top notch! What do you love most?', icon: Flame },
  4: { text: 'Nice one! What can we add to make it a solid 5/5?', icon: Rocket },
  3: { text: 'Fair enough! What feature is missing for you?', icon: ThumbsUp },
  2: { text: 'Not quite there yet? Where can we do better?', icon: Wrench },
  1: {
    text: 'E get as e be? Tell us what went wrong so we can fix it sharp-sharp!',
    icon: Frown,
  },
};

export default function ReviewPromptModal() {
  const { isOpen, dismiss, markSubmitted } = useReviewPrompt();
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const activeRating = hoverRating || rating;
  const currentReaction = STAR_REACTIONS[activeRating] || STAR_REACTIONS[5];
  const ReactionIcon = currentReaction.icon;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/feedback', {
        rating,
        tags: selectedTags,
        comment: comment.trim() || undefined,
      });

      markSubmitted();
      toast.success(
        "Thank you, Boss! You're helping us build the best ERP for Nigerian businesses",
        { duration: 5000 },
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to submit feedback. Try again later.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-labelledby='review-prompt-title'
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200'
    >
      <div className='relative w-full max-w-md rounded-2xl bg-panel border border-hairline p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200'>
        {/* Close Button */}
        <button
          onClick={dismiss}
          aria-label='Dismiss review prompt'
          className='absolute right-3.5 top-3.5 rounded-full p-1 text-ink-subtle hover:bg-panel-subtle hover:text-ink transition-colors'
        >
          <X className='h-3.5 w-3.5' />
        </button>

        {/* Header */}
        <div className='text-center space-y-1.5'>
          <h2
            id='review-prompt-title'
            className='text-lg font-bold tracking-tight text-ink'
          >
            How is your experience, Boss?
          </h2>

          <p className='text-xs text-ink-muted max-w-sm mx-auto leading-relaxed'>
            You've spent your first few minutes checking out WallXERP. How is the speed and feel so far?
          </p>
        </div>

        {/* 5-Star Interactive Rating */}
        <div className='flex flex-col items-center justify-center space-y-2.5 py-1'>
          <div className='flex items-center gap-1.5'>
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = star <= activeRating;
              return (
                <button
                  key={star}
                  type='button'
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className='p-0.5 rounded-lg transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
                  aria-label={`Rate ${star} out of 5 stars`}
                >
                  <Star
                    className={`h-7 w-7 transition-colors ${
                      isFilled
                        ? 'fill-amber-400 text-amber-400 drop-shadow-xs'
                        : 'text-gray-300 hover:text-amber-200'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Dynamic Reaction Micro-copy with Icon */}
          <div className='flex items-center gap-1.5 text-xs font-semibold text-primary-700 min-h-[20px] text-center transition-all animate-in fade-in duration-150'>
            <ReactionIcon className='h-3.5 w-3.5 flex-shrink-0' />
            <p>{currentReaction.text}</p>
          </div>
        </div>

        {/* 1-Tap Sentiment Chips */}
        <div className='space-y-2'>
          <label className='block text-center text-[10px] font-semibold text-ink-muted uppercase tracking-wide'>
            Tap what applies to your experience:
          </label>

          <div className='flex flex-wrap items-center justify-center gap-1.5'>
            {SENTIMENT_CHIPS.map(({ label, icon: Icon }) => {
              const isSelected = selectedTags.includes(label);
              return (
                <button
                  key={label}
                  type='button'
                  onClick={() => toggleTag(label)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-primary-600 text-white shadow-sm scale-[1.02] border border-primary-600'
                      : 'bg-panel-subtle text-ink-muted border border-hairline hover:bg-panel hover:text-ink hover:border-primary-300'
                  }`}
                >
                  <Icon className='h-3 w-3 flex-shrink-0' />
                  <span>{label}</span>
                  {isSelected && <Check className='h-3 w-3 stroke-[2.5]' />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional Comment Input */}
        <div>
          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder='Any feature you need next or feedback for the team? (Optional)'
            className='w-full p-2.5 text-xs rounded-lg border border-hairline bg-panel text-ink placeholder:text-ink-subtle focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none'
          />
        </div>

        {/* Actions Bar */}
        <div className='space-y-2'>
          <button
            type='button'
            disabled={submitting}
            onClick={handleSubmit}
            className='w-full py-2.5 px-5 rounded-full bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50'
          >
            {submitting ? (
              <span className='inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent' />
            ) : (
              <>
                <Send className='h-3.5 w-3.5' />
                <span>Send My Feedback</span>
              </>
            )}
          </button>

          <div className='flex items-center justify-center'>
            <button
              type='button'
              onClick={dismiss}
              className='text-[11px] font-medium text-ink-subtle hover:text-ink underline transition-colors'
            >
              Remind me in 10 days
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
