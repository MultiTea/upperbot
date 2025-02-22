import { Composer, GrammyError } from "grammY";

export const newMemberPoll = new Composer();

// Fonction pour créer le scénario d'ajout
newMemberPoll.on("chat_join_request", async (ctx) => {
  const user = ctx.from;
  const chatId = ctx.chat?.id;

  //Constition du sondage
  const question =
    `🆕 Nouvelle demande → ${user?.first_name} souhaite se joindre à nous ! Souhaitez-vous l'intégrer à l'événement ?`;

  const pollOptions = [
    "✅ Oui, pas de soucis !",
    "🚫 Non, je ne souhaite pas",
    "❔ Ne connait pas / se prononce pas",
  ];

  // Constitution du lien de présentation
  const userLink = `https://t.me/${user?.username || user?.id}`;
  const specialChar = "\u2060"; // Utiliser le caractère spécial
  const message = `[${specialChar}](${userLink})`;

  // Envoi du sondage et lien de présentation dans le groupe
  // deno-lint-ignore prefer-const
  let pollMessage;
  // @ts-ignore (Const can be applied as parameter)
  pollMessage = await ctx.api.sendPoll(chatId, question, pollOptions, {
    is_anonymous: true,
  });

  await ctx.api.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    link_preview_options: { show_above_text: true },
  });

  console.log(
    `Sondage créé pour ${user?.first_name} avec l'ID: ${pollMessage.poll.id}`,
  );

  setTimeout(async () => {
    try {
      await ctx.api.stopPoll(chatId, pollMessage.message_id);
      console.log("Sondage fermé avec l'ID: ", pollMessage.poll.id);
    } catch (err) {
      if (err instanceof GrammyError) {
        console.error("Grammy error:", err);
      } else {
        console.error("Unknow Error:", err);
      }
    }
  }, 60000); //60 secondes
});
