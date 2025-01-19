const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} = require('discord.js');
const config = require('./config.json');
const moment = require('moment-timezone'); // Import moment-timezone

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const commands = [
  {
    name: 'setup-ticket',
    description: 'Sets up the ticket system embed message',
    options: [
      {
        name: 'channel',
        description: 'The channel to send the embed message to',
        type: 7, // Channel type
        required: true,
      },
    ],
  },
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands }
    );
    console.log('Slash commands registered!');
  } catch (error) {
    console.error(error);
  }
})();

// Bot ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  if (commandName === 'setup-ticket') {
    const channel = options.getChannel('channel');
    if (!channel.isTextBased()) {
      return interaction.reply({
        content: 'Please select a text channel!',
        flags: 64,  // ephemeral flag for message
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(config.texts.embedTitle)
      .setDescription(
        `**Open a ticket!**\n\n` +
        `**How to create a ticket?**\n` +
        `Please choose the right category when opening a ticket. If you don't know what it falls under, please open a general support ticket.\n\n` +
        `\`\`\`Once you opened a ticket you'll have to answer the question. Please fill out them so we can help you quicker and understand your issue better!\`\`\``
      )
      .setColor('Blue');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket-dropdown')
      .setPlaceholder(config.texts.dropdownPlaceholder)
      .addOptions(
        config.categories.map((cat) => ({
          label: cat.label,
          description: cat.description,
          value: cat.categoryId,
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Ticket system set up!', flags: 64 });
  }
});

// Handle dropdown menu interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'ticket-dropdown') {
    const categoryId = interaction.values[0];
    const category = interaction.guild.channels.cache.get(categoryId);

    if (!category || category.type !== 4) { // 4 = Category type
      return interaction.reply({
        content: 'Invalid category ID in config file.',
        flags: 64,  // flags: 64 = ephemeral (replaces the deprecated ephemeral option)
      });
    }

    // Create a ticket channel
    const ticketChannel = await category.guild.channels.create({
      name: `${category.name}-${interaction.user.username}`,
      type: ChannelType.GuildText, // Text channel
      parent: categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: ['ViewChannel'],
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
      ],
    });

    // Fetch the user who opened the ticket
    const userTag = interaction.user.tag;

    // Get current time in IST (Indian Standard Time)
    const timeInIST = moment().tz("Asia/Kolkata").format('YYYY-MM-DD HH:mm:ss');

    // Send embed to notify admins (via DM)
    const adminRole = interaction.guild.roles.cache.get(config.adminRoleId);
    const adminMembers = interaction.guild.members.cache.filter(member => member.roles.cache.has(config.adminRoleId));

    const adminEmbed = new EmbedBuilder()
      .setTitle('Ticket Created')
      .setDescription(
        `**Ticket Opened by** - <@${interaction.user.id}> (User who opened the ticket)\n` + // User who opened the ticket
        `**Ticket Opened Time** - ${timeInIST}\n` +
        `**Ticket Category** - ${category.name}`
      )
      .setColor('Green');

    if (adminMembers.size > 0) {
      // Send DM to each admin
      adminMembers.forEach(async (admin) => {
        try {
          await admin.send({
            content: `@here A new ticket has been created!`,
            embeds: [adminEmbed],
          });
        } catch (err) {
          console.error(`Couldn't send DM to ${admin.user.tag}: ${err.message}`);
        }
      });
    }

    // Send welcome message in the newly created ticket channel
    const welcomeEmbed = new EmbedBuilder()
      .setDescription(`Hey there <@${interaction.user.id}>! Thanks for opening a Store ticket!\nAn available staff will be with you shortly, be patient!`)
      .setColor('Green');

    await ticketChannel.send({ embeds: [welcomeEmbed] });

    // Add a close button
    const closeButton = new ButtonBuilder()
      .setCustomId('close-ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(closeButton);
    await ticketChannel.send({ components: [row] });

    // Acknowledge interaction
    await interaction.reply({
      content: 'Ticket created successfully!',
      flags: 64, // ephemeral
    });
  }
});

// Handle button interactions (for closing the ticket)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'close-ticket') {
    if (!interaction.member.permissions.has('ADMINISTRATOR')) {
      return interaction.reply({ content: 'You do not have permission to close this ticket!', flags: 64 });
    }

    const ticketChannel = interaction.channel;

    // Send the reply to acknowledge ticket closing before deleting the channel
    await interaction.reply({ content: 'Ticket will be closed shortly...', flags: 64 });

    // Check if the channel still exists before deleting it
    if (ticketChannel && ticketChannel.type === ChannelType.GuildText) {
      try {
        // Wait for 3 seconds before deleting the channel
        setTimeout(async () => {
          await ticketChannel.delete();
        }, 3000); // 3000 ms = 3 seconds

      } catch (err) {
        console.error('Error deleting the channel:', err);
      }
    }
  }
});

// Log in the bot
client.login(config.token);
