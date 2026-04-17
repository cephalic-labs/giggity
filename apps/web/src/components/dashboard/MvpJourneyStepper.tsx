type JourneyStage = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  active: boolean;
};

type MvpJourneyStepperProps = {
  hasSession: boolean;
  hasQuote: boolean;
  hasActivePolicy: boolean;
  hasTriggerActivity: boolean;
  hasClaimActivity: boolean;
  hasPayoutActivity: boolean;
};

const stageTone = (done: boolean, active: boolean) => {
  if (done) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (active) return "border-[#C0392B] bg-[#C0392B]/5 text-[#C0392B]";
  return "border-[#1A1A1A]/10 bg-white text-[#1A1A1A]/60";
};

export function MvpJourneyStepper({
  hasSession,
  hasQuote,
  hasActivePolicy,
  hasTriggerActivity,
  hasClaimActivity,
  hasPayoutActivity,
}: MvpJourneyStepperProps) {
  const stages: JourneyStage[] = [
    {
      key: "session",
      title: "Authenticate",
      detail: "Sign in or sign up to enter the protected flow.",
      done: hasSession,
      active: !hasSession,
    },
    {
      key: "quote",
      title: "Quote",
      detail: "Fetch the weekly premium for the current zone.",
      done: hasQuote,
      active: hasSession && !hasQuote,
    },
    {
      key: "policy",
      title: "Activate policy",
      detail: "Purchase protection for the week and persist coverage.",
      done: hasActivePolicy,
      active: hasQuote && !hasActivePolicy,
    },
    {
      key: "trigger",
      title: "Detect disruption",
      detail: "Scheduled weather and AQI checks create trigger events.",
      done: hasTriggerActivity,
      active: hasActivePolicy && !hasTriggerActivity,
    },
    {
      key: "claim",
      title: "Create claim",
      detail: "Trigger events automatically generate claim records.",
      done: hasClaimActivity,
      active: hasTriggerActivity && !hasClaimActivity,
    },
    {
      key: "payout",
      title: "Release payout",
      detail: "Approved claims move to payout release and dashboard proof.",
      done: hasPayoutActivity,
      active: hasClaimActivity && !hasPayoutActivity,
    },
  ];

  const nextStage = stages.find((stage) => !stage.done) ?? stages[stages.length - 1];

  return (
    <section className="border border-[#1A1A1A]/10 bg-white p-5 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#1A1A1A]/5 pb-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">Locked MVP flow</p>
          <h3 className="font-serif text-xl font-bold italic">The only path that matters</h3>
        </div>
        <div className="ml-auto text-right">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40">Next step</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#C0392B] font-bold">{nextStage.title}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {stages.map((stage) => (
          <article key={stage.key} className={`border p-4 ${stageTone(stage.done, stage.active)}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <h4 className="font-mono text-[10px] uppercase tracking-widest font-bold">{stage.title}</h4>
              <span className="font-mono text-[9px] uppercase tracking-widest">
                {stage.done ? "Done" : stage.active ? "Active" : "Pending"}
              </span>
            </div>
            <p className="text-sm leading-relaxed opacity-80">{stage.detail}</p>
          </article>
        ))}
      </div>

      <div className="border border-[#1A1A1A]/5 bg-[#F4F4F0]/40 p-4">
        <p className="font-mono text-[9px] uppercase tracking-widest text-[#1A1A1A]/40 mb-1">Flow rule</p>
        <p className="text-sm leading-relaxed text-[#1A1A1A]/80">
          Session, quote, policy activation, disruption detection, claim creation, and payout release must all
          happen in this order. Any shortcut is treated as a fallback path and not the product loop.
        </p>
      </div>
    </section>
  );
}