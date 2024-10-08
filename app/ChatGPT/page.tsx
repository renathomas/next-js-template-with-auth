"use client";
import { useSession } from "next-auth/react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { HistoryEntry } from "../context/ChatLog";
import { useChatStore } from "../store/store";
import BotMessage from "./components/BotMessage";
import ChatHeader from "./components/ChatHeader";
import ChatPrompt from "./components/ChatPrompt";
import Error from "./components/Error";
import Loading from "./components/Loading";
import SideBar from "./components/SideBar";
import UserMessage from "./components/UserMessage";

const ChatGPT = () => {
  const { status, data: session } = useSession();

  const [isProcessingMessage, setIsProcessingMessage] =
    useState<boolean>(false);
  const [err, setErr] = useState<string | boolean>(false);
  const [responseFromAPI, setResponseFromAPI] = useState<boolean>(false);

  // Add a reference to the chat container
  const chatBodyRef = useRef<HTMLDivElement>(null);

  const {
    inputPrompt,
    setInputPrompt,
    setInputHeight,
    chatlog,
    addObject,
    addHistory,
    currentHistory,
    setCurrentHistory,
    initChatLog,
    initHistory,
  } = useChatStore();

  // Scroll to the bottom of the chat container whenever a new message is added
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [chatlog]);

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement | HTMLTextAreaElement>,
  ) => {
    e.preventDefault();
    if (!responseFromAPI && inputPrompt.trim() !== "") {
      const newChatLogEntry = {
        chatPrompt: inputPrompt,
        botMessage: null,
      };

      addObject(newChatLogEntry);
      setInputHeight(35);
      setInputPrompt("");
      setResponseFromAPI(true);
      setIsProcessingMessage(true);

      try {
        let response = null;
        if (status === "authenticated") {
          if (chatlog.length === 0) {
            const result = await fetch("/api/chatgpt/history", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: inputPrompt,
                userEmail: session.user?.email,
              }),
            });

            const data = await result.json();
            const { id, name } = data.newHistory;
            setCurrentHistory({ id, name } as HistoryEntry);

            response = await fetch("/api/chatgpt/respond", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: inputPrompt,
                userEmail: session.user?.email,
                history: id,
              }),
            });
          } else {
            response = await fetch("/api/chatgpt/respond", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: inputPrompt,
                userEmail: session.user?.email,
                history: currentHistory?.id,
              }),
            });
          }
        } else {
          response = await fetch("/api/chatgpt/respond", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: inputPrompt, userEmail: "Guest" }),
          });
        }

        const data = await response.json();
        setIsProcessingMessage(false);
        addObject({ ...newChatLogEntry, botMessage: data.botResponse }, true);
        setErr(false);
      } catch (error) {
        console.log(error);
      } finally {
        setResponseFromAPI(false);
      }
    }
  };

  /*
   If the user is authenticated, it fetches the chat history (conversations) associated with their email.
   It loops through each history entry and adds it to the state using addHistory.
  */
  const fetchHistoryByEmail = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/chatgpt/history?email=${encodeURIComponent(session?.user?.email as string)}`,
      );
      if (!response.ok) {
        console.log("Failed to fetch messages");
      }
      const { histories } = await response.json();

      // Check if data is an array
      if (Array.isArray(histories)) {
        // Process the messages if it's an array
        histories.map((msg: { id: number; name: string }) => {
          const newHistoryEntry = {
            id: msg.id,
            name: msg.name,
          };

          addHistory(newHistoryEntry);
        });
      }
      return histories;
    } catch (error) {
      console.log("Failed to fetch histories", error);
    }
  }, [session?.user?.email]);

  /*
   When a specific chat history (conversation) is selected, it fetches all messages 
   (user and bot) for that conversation and populates the chat log using addObject.
  */
  const fetchMessagesByEmail = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/chatgpt/getMessages?history=${encodeURIComponent(currentHistory?.id as unknown as number)}`,
      );
      if (!response.ok) {
        console.log("Failed to fetch messages");
      }
      const { messages } = await response.json();

      // Check if data is an array
      if (Array.isArray(messages)) {
        // Process the messages if it's an array
        messages.map((msg: { chatPrompt: any; botMessage: any }) => {
          const newChatLogEntry = {
            chatPrompt: msg.chatPrompt,
            botMessage: msg.botMessage,
          };

          addObject(newChatLogEntry);
        });
      }
      return messages;
    } catch (error) {
      console.log("Failed to fetch messages", error);
    }
  }, [currentHistory?.id]);

  /*
   On component load, if the user is authenticated, it initializes chat history and calls
   fetchHistoryByEmail to load all previous chat histories.
  */
  useEffect(() => {
    if (status === "authenticated") {
      initHistory();
      fetchHistoryByEmail();
    }
  }, [fetchHistoryByEmail, status]);

  /*
   When the currentHistory changes (i.e., a specific chat is selected), it triggers a fetch 
   of all messages associated with that history.
  */
  useEffect(() => {
    if (currentHistory?.name !== undefined && status === "authenticated") {
      initChatLog();
      fetchMessagesByEmail();
    }
  }, [fetchMessagesByEmail, currentHistory]);

  return (
    <>
      <ChatHeader />
      <div className="flex">
        <SideBar />
        <div className="flex-1">
          {/* Attach the ref to the chat body */}
          <div
            dir="ltr"
            className="z-0 h-[calc(100vh-219px)] w-full overflow-auto"
            id="chat-body"
            ref={chatBodyRef} // reference for scrolling
          >
            <div className="py-2 sm:py-3 md:py-4">
              {chatlog.length > 0 && (
                <div>
                  {chatlog.map((chat, idx) => (
                    <div key={idx} id={`chat-${idx}`}>
                      <UserMessage inputPrompt={chat.chatPrompt} />
                      <div>
                        {chat.botMessage === null ? (
                          <Loading />
                        ) : err ? (
                          <Error
                            message={
                              typeof err === "string"
                                ? err
                                : "An error occurred."
                            }
                          />
                        ) : (
                          <BotMessage botMessage={chat.botMessage} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <ChatPrompt
            isProcessingMessage={isProcessingMessage}
            handleSubmit={handleSubmit}
          />
        </div>
      </div>
    </>
  );
};

export default ChatGPT;
