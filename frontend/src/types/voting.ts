export type VotingQuestion = {
  id: string;
  text: string;
  options: string[];
};

export type Voting = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_by: string;
  questions: VotingQuestion[];
};