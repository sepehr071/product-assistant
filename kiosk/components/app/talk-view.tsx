'use client';

import { type ComponentProps, useEffect, useRef, useState } from 'react';
import {
  type AgentState,
  useAgent,
  useSessionContext,
  useSessionMessages,
} from '@livekit/components-react';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr';
import { AgentAudioVisualizerAura } from '@/components/agents-ui/agent-audio-visualizer-aura';
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript';
import { AgentControlBar } from '@/components/agents-ui/agent-control-bar';
import { setProduct } from '@/lib/agent-rpc';
import { cn } from '@/lib/shadcn/utils';

type ProductCard = {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  nutrition?: string;
  allergens?: string;
};

interface TalkViewProps {
  barcode: string;
  onDone: () => void;
}

const IDLE_MS = 45_000;

const STATE_LABEL: Partial<Record<AgentState, string>> = {
  listening: 'Listening',
  thinking: 'Checking the pack',
  speaking: 'Speaking',
};

// "Per 100 g: energy 97 kcal, protein 9.0 g, fat 5.0 g of which saturates 3.2 g, ..."
// -> { basis: 'Per 100 g', rows: [{ name: 'energy', value: '97 kcal' }, { name: 'saturates', sub: true }, ...] }
function parseNutrition(text?: string) {
  const line = text?.split('\n')[0]?.trim();
  if (!line) {
    return null;
  }
  const [basis, rest = ''] = line.split(/:(.*)/);
  const rows: { name: string; value: string; sub: boolean }[] = [];
  for (const part of rest.split(',')) {
    part.split(/\bof which\b/).forEach((piece, index) => {
      const match = piece.trim().match(/^([a-z ]+?)\s+([0-9.]+\s*(?:kcal|kj|mg|g|ml))\.?$/i);
      if (match) {
        rows.push({ name: match[1], value: match[2], sub: index > 0 });
      }
    });
  }
  return rows.length ? { basis: basis.trim(), rows } : null;
}

function StatePill({ state }: { state: AgentState }) {
  const label = STATE_LABEL[state] ?? 'Connecting';
  return (
    <p
      aria-live="polite"
      className="text-foreground/85 flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-sm"
    >
      <span
        className={cn(
          'size-2 rounded-full',
          state === 'speaking' && 'bg-[var(--ticket)] shadow-[0_0_10px_var(--ticket)]',
          state === 'thinking' && 'animate-pulse bg-[var(--ticket)]/70',
          state === 'listening' && 'bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/70',
          !STATE_LABEL[state] && 'animate-pulse bg-white/40'
        )}
      />
      {label}
    </p>
  );
}

function ShelfTicket({ product }: { product: ProductCard }) {
  const facts = parseNutrition(product.nutrition);
  const allergens = product.allergens?.split('\n').filter(Boolean) ?? [];

  return (
    <article className="flex flex-col rounded-sm bg-[#f4f1e6] text-[#0b1210] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
      <div className="flex items-baseline justify-between border-b-4 border-[#0b1210] px-5 pt-4 pb-2">
        <h2 className="text-xl font-bold tracking-tight">Nutrition</h2>
        <p className="text-sm text-[#0b1210]/65">{facts?.basis ?? 'From the pack'}</p>
      </div>
      {facts ? (
        <dl className="px-5 py-2 text-[15px]">
          {facts.rows.map((row) => (
            <div
              key={row.name}
              className={cn(
                'flex justify-between gap-4 border-b border-[#0b1210]/15 py-1.5 last:border-0',
                row.sub && 'pl-4 text-[#0b1210]/70'
              )}
            >
              <dt className="first-letter:uppercase">
                {row.sub ? `of which ${row.name}` : row.name}
              </dt>
              <dd className="font-mono tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-5 py-6 text-sm text-[#0b1210]/60">Reading the pack…</p>
      )}
      {allergens.length ? (
        <div className="mx-5 mb-4 flex gap-2.5 rounded-sm bg-[var(--laser)]/12 px-3 py-2.5 text-sm text-[#8a1c10]">
          <WarningCircleIcon className="mt-0.5 size-4 shrink-0" weight="bold" />
          <p className="leading-snug">{allergens.join(' ')}</p>
        </div>
      ) : null}
      <div className="mt-auto flex flex-col items-center border-t border-dashed border-[#0b1210]/25 px-5 pt-3 pb-2">
        <span aria-hidden className="barcode-bars block h-8 w-40" />
        <span className="mt-1 font-mono text-[11px] tracking-[0.18em]">{product.barcode}</span>
      </div>
    </article>
  );
}

export function TalkView({ barcode, onDone, ref }: ComponentProps<'section'> & TalkViewProps) {
  const session = useSessionContext();
  const agent = useAgent();
  const { messages } = useSessionMessages(session);
  const [product, setProductState] = useState<ProductCard>({ barcode, name: 'Looking up pack…' });
  const sent = useRef<string | null>(null);

  useEffect(() => {
    void fetch(`/api/product/${barcode}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: ProductCard | null) => {
        if (body?.name) {
          setProductState(body);
        }
      })
      .catch(() => {
        setProductState({ barcode, name: barcode });
      });
  }, [barcode]);

  useEffect(() => {
    if (!agent.isConnected || sent.current === barcode) {
      return;
    }
    sent.current = barcode;
    const identity = agent.isConnected ? agent.identity : undefined;
    void setProduct(session.room, barcode, identity).catch((error: unknown) => {
      console.error(error);
      sent.current = null;
    });
  }, [agent.isConnected, barcode, session.room, agent]);

  useEffect(() => {
    const timer = window.setTimeout(onDone, IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [barcode, messages.length, agent.state, onDone]);

  return (
    <section
      ref={ref}
      className="relative flex h-svh w-full flex-col overflow-y-auto px-5 py-6 sm:px-8 md:px-12 lg:overflow-hidden"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full bg-[var(--laser)] shadow-[0_0_10px_var(--laser)]" />
            Scanned just now
          </p>
          <h1 className="mt-3 text-4xl leading-[0.95] font-semibold tracking-[-0.03em] text-balance md:text-6xl">
            {product.name}
          </h1>
          <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-sm">
            {product.category ? (
              <span className="rounded-full border border-white/10 px-2 py-px text-xs">
                {product.category}
              </span>
            ) : null}
            {product.brand}
          </p>
        </div>
        <StatePill state={agent.state} />
      </header>

      <div className="laser-line mt-6 shrink-0" />

      <div className="grid flex-1 grid-cols-1 gap-6 pt-6 lg:grid-cols-[17rem_minmax(0,1fr)_22rem] lg:gap-8">
        <div className="order-3 lg:order-1 lg:overflow-y-auto">
          <ShelfTicket product={product} />
        </div>

        <div className="relative order-1 grid min-h-64 place-items-center lg:order-2">
          <AgentAudioVisualizerAura
            size="xl"
            state={agent.state}
            audioTrack={agent.microphoneTrack}
            color="#E8C547"
            colorShift={0.12}
            themeMode="dark"
            className="size-[min(40vh,26rem)] lg:size-[min(52vh,28rem)]"
          />
        </div>

        <div className="order-2 flex h-80 min-h-0 flex-col rounded-md border border-white/10 bg-black/30 lg:order-3 lg:h-auto">
          <p className="text-foreground/80 border-b border-white/5 px-4 py-3 text-sm font-medium">
            Conversation
          </p>
          {messages.length ? (
            <AgentChatTranscript
              agentState={agent.state}
              messages={messages}
              className="min-h-0 flex-1 **:data-[slot=message-scroller-content]:p-4"
            />
          ) : (
            <p className="text-muted-foreground m-auto max-w-[16rem] p-6 text-center text-sm leading-relaxed">
              Ask out loud, for example “How much sugar is in one serving?”
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl shrink-0 pt-4">
        <AgentControlBar
          variant="livekit"
          controls={{
            leave: true,
            microphone: true,
            chat: false,
            camera: false,
            screenShare: false,
          }}
          isChatOpen={false}
          isConnected={session.isConnected}
          onDisconnect={onDone}
        />
        <p className="text-muted-foreground mt-3 text-center text-xs">
          Pack facts only. Not medical advice.
        </p>
      </div>
    </section>
  );
}
