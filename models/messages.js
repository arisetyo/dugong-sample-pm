/**
 * This file contains the functions to load messages from the database.
 */

// Load mesages from the database
const loadMessages = async (SUPABASE, user_id) => {
  const { data, error } = await SUPABASE
    .from('messages')
    .select(`
      id,
      subject,
      message,
      is_read,
      created_at,
      senders:senders!messages_sender_id_fkey ( id, sender_name )
    `)
    .eq('receiver_id', 1)
    .order('id', { ascending: false })

  if (error) {
    console.error('Error fetching messages:', error)
    return { status: 'error' }
  }

  return { status: 'success', data }
}

// Load a single message from the database
const loadMessage = async (SUPABASE, message_id) => {
  const { data, error } = await SUPABASE
    .from('messages')
    .select(`
      id,
      message,
      created_at,
      senders:senders!messages_sender_id_fkey ( id, sender_name )
    `)
    .eq('id', message_id)

  if (error) {
    console.error('Error fetching message:', error)
    return { status: 'error' }
  }

  return { status: 'success', data }
}

export { loadMessages, loadMessage }